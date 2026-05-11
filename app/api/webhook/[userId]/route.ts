// Per-user WhatsApp delivery webhook. Each user pastes a URL of the form
//   https://www.swiftreach.app/api/webhook/<userId>
// into Meta's webhook configuration. Meta then hits this endpoint with that
// user's verify token (GET handshake) or status updates / inbound messages
// (POST).
//
// We scope every status update to contacts that belong to a campaign owned
// by the user in the URL — defense in depth: even if Meta misrouted a
// callback, we wouldn't update some other user's records.
//
// Phase 6: also processes inbound messages. If the body matches an opt-out
// keyword (STOP, UNSUBSCRIBE, etc.) we mark the contact as opted out and
// scrub them from any pending scheduled campaigns. Non-keyword inbound
// messages are currently silent — a future inbox feature can pick these
// up.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/errorLog";
import { detectOptOutKeyword, processOptOut } from "@/lib/optOut";
import { normalizePhone } from "@/lib/phoneUtils";

export const dynamic = "force-dynamic";

interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient_id?: string;
  timestamp?: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface InboundMessage {
  id?: string;
  from: string; // E.164 without leading +
  type?: string;
  timestamp?: string;
  text?: { body?: string };
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: StatusUpdate[];
        messages?: InboundMessage[];
      };
    }>;
  }>;
}

// ── GET — Meta verification handshake ────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { webhookVerifyToken: true },
  });

  // Identical 403 response whether the user doesn't exist or the token is
  // wrong — don't leak whether a userId is real.
  if (
    mode === "subscribe" &&
    challenge &&
    user?.webhookVerifyToken &&
    user.webhookVerifyToken === token
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — delivery / read / fail status callbacks + inbound messages ────────
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const statuses: StatusUpdate[] = [];
  const inbound: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) statuses.push(s);
      for (const m of change.value?.messages ?? []) inbound.push(m);
    }
  }

  // ── Status updates ──────────────────────────────────────────────────────
  for (const s of statuses) {
    try {
      const updates: Record<string, unknown> = { status: s.status };
      if (s.status === "delivered") updates.deliveredAt = new Date();
      if (s.status === "read") {
        updates.deliveredAt = updates.deliveredAt ?? new Date();
        updates.readAt = new Date();
      }
      if (s.status === "failed" && s.errors?.[0]) {
        updates.errorMessage = `[${s.errors[0].code}] ${s.errors[0].title}${
          s.errors[0].message ? ` — ${s.errors[0].message}` : ""
        }`;
      }
      await prisma.contact.updateMany({
        where: {
          whatsappMsgId: s.id,
          campaign: { userId: params.userId },
        },
        data: updates,
      });
    } catch (err) {
      // Log but continue — one bad status shouldn't drop the rest of the batch.
      await logError("POST /api/webhook/[userId]", err, {
        userId: params.userId,
      });
    }
  }

  // ── Inbound messages — opt-out detection + inbox storage ───────────────
  for (const m of inbound) {
    try {
      const text = m.text?.body ?? "";
      // Meta's `from` is E.164 digits without the + prefix; normalisePhone
      // tolerates either shape and returns digits only.
      const phone = normalizePhone(m.from, "1");
      if (!phone) continue;

      const keyword = detectOptOutKeyword(text);
      if (keyword) {
        await processOptOut(params.userId, phone, keyword, "whatsapp");
        // Opt-outs do NOT land in the inbox — they're a system signal,
        // not a conversation. /admin → opt-out logs is the audit trail.
        continue;
      }

      // Non-keyword reply: store as InboundMessage so /inbox can render it.
      // Look up the contact's name from SavedContact (snapshot at insert
      // time — SavedContact name edits don't propagate to old inbox rows).
      const saved = await prisma.savedContact.findUnique({
        where: {
          userId_phoneNumber: { userId: params.userId, phoneNumber: phone },
        },
        select: { data: true },
      });
      let contactName: string | null = null;
      if (saved?.data) {
        try {
          const data: Record<string, string> = JSON.parse(saved.data);
          contactName =
            data["Name"] ||
            data["name"] ||
            data["FullName"] ||
            data["Full Name"] ||
            data["full_name"] ||
            null;
        } catch {
          contactName = null;
        }
      }

      // Most recent campaign that sent to this phone — for the
      // "Reply to: [campaign name]" header in the detail panel.
      const lastContact = await prisma.contact.findFirst({
        where: {
          phoneNumber: phone,
          campaign: { userId: params.userId },
          status: { in: ["sent", "delivered", "read"] },
        },
        orderBy: { sentAt: "desc" },
        select: { campaignId: true },
      });

      await prisma.inboundMessage.create({
        data: {
          userId: params.userId,
          fromPhone: phone,
          contactName,
          messageText: text,
          messageId: m.id ?? null,
          campaignId: lastContact?.campaignId ?? null,
        },
      });
    } catch (err) {
      await logError("POST /api/webhook/[userId] inbound", err, {
        userId: params.userId,
      });
    }
  }

  // Always 200 — Meta retries on non-2xx forever.
  return NextResponse.json({ ok: true });
}
