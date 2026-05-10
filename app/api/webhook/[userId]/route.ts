// Per-user WhatsApp delivery webhook. Each user pastes a URL of the form
//   https://www.swiftreach.app/api/webhook/<userId>
// into Meta's webhook configuration. Meta then hits this endpoint with that
// user's verify token (GET handshake) or status updates (POST).
//
// We scope every status update to contacts that belong to a campaign owned
// by the user in the URL — defense in depth: even if Meta misrouted a
// callback, we wouldn't update some other user's records.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient_id?: string;
  timestamp?: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: StatusUpdate[];
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

// ── POST — delivery / read / fail status callbacks ───────────────────────────
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
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        statuses.push(s);
      }
    }
  }

  // Scope every update to contacts whose campaign is owned by params.userId.
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

  // Always 200 — Meta retries on non-2xx forever.
  return NextResponse.json({ ok: true });
}
