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
import { createHmac, timingSafeEqual } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/errorLog";
import { detectOptOutKeyword, processOptOut } from "@/lib/optOut";
import { normalizePhone } from "@/lib/phoneUtils";
import { emitEvent } from "@/lib/webhookDispatcher";
import type { WebhookEventType } from "@/lib/webhookEvents";

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

// ── Signature verification helper ───────────────────────────────────────
// Meta signs every webhook POST with HMAC-SHA256 over the raw request
// body, keyed on the Meta App Secret. The header shape is:
//   X-Hub-Signature-256: sha256=<lowercase hex>
//
// Two modes depending on env state:
//   enforce (META_APP_SECRET set): bad signature → reject 401
//   log-only (secret missing): log the miss, allow the request through
//
// Log-only is a bootstrap concession so a misconfigured env can't
// blackhole real Meta traffic the moment this deploys. The outbound
// webhook dispatcher (Step 4+) refuses to ship while log-only mode
// is in effect — that gate lives in lib/webhookDispatcher.ts so a
// mistake here can't quietly forward forged payloads downstream.
function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): "ok" | "missing-secret" | "invalid" {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) return "missing-secret";

  // Meta sends "sha256=<hex>". Reject anything else outright — there's
  // no legitimate case for a malformed header.
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return "invalid";
  }
  const providedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (providedHex.length !== expectedHex.length) return "invalid";

  // timingSafeEqual requires equal-length buffers (checked above).
  const ok = timingSafeEqual(
    Buffer.from(providedHex, "hex"),
    Buffer.from(expectedHex, "hex")
  );
  return ok ? "ok" : "invalid";
}

// ── Status ordering for monotonicity guard ─────────────────────────────
// Meta can deliver status callbacks out of order (observed in practice:
// read before delivered, delivered after read, multiple deliveries of
// the same sent). We only ever advance state forward:
//   sent → delivered → read
// Failed is terminal in a separate axis — once a row is failed, no
// non-failed status can overwrite it. These rules apply to BOTH the
// Contact and OutboundMessage status column.
const STATUS_PRIORITY: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};
function priorStatusesThatCanAdvanceTo(target: string): string[] {
  const p = STATUS_PRIORITY[target] ?? 0;
  return Object.entries(STATUS_PRIORITY)
    .filter(([, v]) => v < p)
    .map(([k]) => k);
}

// ── POST — delivery / read / fail status callbacks + inbound messages ────────
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  // Consume the body as text FIRST — req.json() would consume the
  // stream and we couldn't HMAC it afterward.
  const rawBody = await req.text();

  // Signature check. If missing or invalid under enforce mode we 401
  // and never parse the body, so an attacker can't trigger side
  // effects by sending plausible JSON with a bogus signature.
  const sigResult = verifyMetaSignature(
    rawBody,
    req.headers.get("x-hub-signature-256")
  );
  if (sigResult === "invalid") {
    await logError(
      "POST /api/webhook/[userId]",
      new Error("Meta webhook: invalid X-Hub-Signature-256 — payload rejected"),
      { userId: params.userId, severity: "warning" }
    );
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }
  if (sigResult === "missing-secret") {
    // Log-only mode. Do NOT reject. Dispatcher gate in Step 4 blocks
    // outbound forwarding while this mode is active.
    await logError(
      "POST /api/webhook/[userId]",
      new Error("META_APP_SECRET not set — webhook running in log-only mode"),
      { userId: params.userId, severity: "warning" }
    );
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
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

  // Accumulated outbound-webhook emits. Filled by the status + inbound
  // loops below; flushed via waitUntil() at the bottom so Meta still
  // gets its fast 200 while each subscriber endpoint gets its POST
  // in the background. A failed emit is logged inside emitEvent — we
  // never rethrow here, since the DB writes for the status have
  // already committed and Meta would retry on a non-200.
  const pendingEmits: Array<() => Promise<void>> = [];

  // ── Status updates ──────────────────────────────────────────────────────
  for (const s of statuses) {
    try {
      // Meta's timestamp is unix seconds as a string. Fall back to
      // server now() only if Meta omitted it (shouldn't happen on
      // real callbacks). Using Meta's time means readAt reflects when
      // the user actually opened, not when our cron got around to
      // processing it.
      const metaTs = s.timestamp
        ? new Date(Number(s.timestamp) * 1000)
        : new Date();

      const updates: Record<string, unknown> = { status: s.status };
      if (s.status === "delivered") {
        updates.deliveredAt = metaTs;
      } else if (s.status === "read") {
        updates.readAt = metaTs;
        // Fill deliveredAt only if currently null — Meta usually sends
        // delivered + read in order, but if the sequence was observed
        // in reverse we want deliveredAt = Meta's own delivered-time,
        // not the read-time. Prisma's `update.where` plus setting via
        // raw null-coalescing isn't possible, so we pass readAt only;
        // deliveredAt backfill is handled below via a second update
        // scoped to rows that still have it null.
      } else if (s.status === "failed") {
        updates.failedAt = metaTs;
        if (s.errors?.[0]) {
          updates.errorMessage = `[${s.errors[0].code}] ${s.errors[0].title}${
            s.errors[0].message ? ` — ${s.errors[0].message}` : ""
          }`;
        }
      }

      // Monotonicity: only apply when the current status is strictly
      // lower-priority than the incoming one. A late "delivered"
      // arriving after "read" finds no matching rows and silently
      // no-ops — which is the whole point.
      const allowedPriors = priorStatusesThatCanAdvanceTo(s.status);
      if (allowedPriors.length === 0) continue; // "sent" or unknown — nothing to advance

      // Update the historical Contact row (campaign send ledger).
      await prisma.contact.updateMany({
        where: {
          whatsappMsgId: s.id,
          status: { in: allowedPriors },
          campaign: { userId: params.userId },
        },
        data: updates,
      });

      // Mirror into OutboundMessage (unified cross-source ledger that
      // the dispatcher reads from). Scoped on userId too so a forged
      // wamid guess can't update another user's row.
      await prisma.outboundMessage.updateMany({
        where: {
          whatsappMsgId: s.id,
          userId: params.userId,
          status: { in: allowedPriors },
        },
        data: updates,
      });

      // deliveredAt backfill on read — only touches rows where
      // deliveredAt is still null (i.e. we skipped straight from sent
      // to read). Done as a separate updateMany so we don't clobber
      // a prior valid deliveredAt Meta gave us.
      if (s.status === "read") {
        await prisma.contact.updateMany({
          where: {
            whatsappMsgId: s.id,
            deliveredAt: null,
            campaign: { userId: params.userId },
          },
          data: { deliveredAt: metaTs },
        });
        await prisma.outboundMessage.updateMany({
          where: {
            whatsappMsgId: s.id,
            userId: params.userId,
            deliveredAt: null,
          },
          data: { deliveredAt: metaTs },
        });
      }

      // Queue a message.* emit for subscribers. Look up the matching
      // OutboundMessage row for the per-event payload fields (phone,
      // campaignId, externalId). If no OutboundMessage exists (pre-
      // Step-1 message, or a wamid we never recorded), skip the emit
      // — we can't fill the payload meaningfully, and the DB updates
      // we just made to Contact still land in the UI regardless.
      const om = await prisma.outboundMessage.findUnique({
        where: { whatsappMsgId: s.id },
        select: {
          userId: true,
          phone: true,
          campaignId: true,
          externalId: true,
        },
      });
      if (om && om.userId === params.userId) {
        const emitType = `message.${s.status}` as WebhookEventType;
        pendingEmits.push(() =>
          emitEvent(prisma, {
            userId: om.userId,
            eventType: emitType,
            // sourceKey tied to status so sent / delivered / read /
            // failed each get their own eventId.
            sourceKey: `${s.id}|${s.status}`,
            messageId: s.id,
            phone: om.phone,
            campaignId: om.campaignId,
            externalId: om.externalId,
            status: s.status,
            timestamp: metaTs,
          })
        );
      }
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
        const optOut = await processOptOut(params.userId, phone, keyword, "whatsapp");
        // Queue the contact.opted_out event. sourceKey = OptOutLog.id
        // which is unique per opt-out event — Meta can't cause a dup
        // because each STOP produces one new OptOutLog row.
        pendingEmits.push(() =>
          emitEvent(prisma, {
            userId: params.userId,
            eventType: "contact.opted_out",
            sourceKey: optOut.optOutLogId,
            phone: optOut.phoneNumber,
            campaignId: optOut.campaignId,
            timestamp: m.timestamp
              ? new Date(Number(m.timestamp) * 1000)
              : new Date(),
          })
        );
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

      const inboxRow = await prisma.inboundMessage.create({
        data: {
          userId: params.userId,
          fromPhone: phone,
          contactName,
          messageText: text,
          messageId: m.id ?? null,
          campaignId: lastContact?.campaignId ?? null,
        },
        select: { id: true },
      });

      // Queue message.replied. sourceKey = InboundMessage.id, which is
      // unique per inbound row — Meta can't dupe because we always
      // create a new row for each delivered inbound event (Meta dedups
      // on its own side before calling us). reply_text carried in the
      // event payload so subscribers don't have to re-fetch.
      pendingEmits.push(() =>
        emitEvent(prisma, {
          userId: params.userId,
          eventType: "message.replied",
          sourceKey: inboxRow.id,
          phone,
          campaignId: lastContact?.campaignId ?? null,
          replyText: text,
          timestamp: m.timestamp
            ? new Date(Number(m.timestamp) * 1000)
            : new Date(),
        })
      );
    } catch (err) {
      await logError("POST /api/webhook/[userId] inbound", err, {
        userId: params.userId,
      });
    }
  }

  // Flush pending webhook emits AFTER the 200. waitUntil keeps the
  // function alive on Vercel until these resolve, but Meta sees our
  // response immediately — exactly the "fast 200, work after" pattern
  // the spec called out. Errors inside the emits are swallowed by
  // emitEvent itself (logged, not thrown); allSettled is a belt in
  // case we ever reintroduce a path that can throw synchronously.
  if (pendingEmits.length > 0) {
    waitUntil(
      Promise.allSettled(pendingEmits.map((fn) => fn())).then(() => undefined)
    );
  }

  // Always 200 — Meta retries on non-2xx forever.
  return NextResponse.json({ ok: true });
}
