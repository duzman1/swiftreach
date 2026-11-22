// Outbound webhook dispatcher.
//
// Two public entry points:
//
//   emitEvent(prisma, params)
//     Called from a send/callback site that just produced an event.
//     Finds every active endpoint subscribed to the event, creates
//     one WebhookDelivery row per endpoint, and attempts an inline
//     POST. Idempotent by design — Meta's own status retries insert
//     with the same deterministic eventId and bounce off the UNIQUE
//     index rather than mint a dupe.
//
//   dispatchDelivery(prisma, deliveryId)
//     Attempts delivery for an existing row. Used by:
//       - the test-event endpoint (POST /api/webhooks/endpoints/[id]/test)
//         after it inserts a PENDING row
//       - the Step 5 retry cron, picking up due PENDING/FAILED rows
//
// Hard gate per the launch guardrail: emitEvent REFUSES to dispatch
// when META_APP_SECRET is missing. That's the state where the
// inbound Meta webhook is running in log-only mode (sig verification
// off), and forwarding to subscribers would mean forwarding forged
// Meta payloads to GHL/etc. We fail CLOSED: warning logged, no row
// created, no HTTP out. dispatchDelivery does NOT gate (rows that
// already exist should still be delivered or retried — the gate
// prevents row CREATION, not delivery of previously-created rows).

import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient, WebhookEndpoint } from "@prisma/client";
import { logError } from "./errorLog";
import { computeEventId, type WebhookEventType } from "./webhookEvents";

// Fetch timeout per endpoint per attempt. Spec'd 10s. Chosen so a
// slow receiver can't tie up the Vercel function (which has its
// own max duration), while still giving a legitimate GHL webhook
// enough slack for cold-start latency.
const DISPATCH_TIMEOUT_MS = 10_000;

// Backoff schedule used when an attempt fails. Index = attemptNumber-1.
// Exponential-ish: 1m, 5m, 30m, 2h, 6h. After the last slot, the row
// transitions to DEAD on the next failure (max ~6 total attempts).
export const WEBHOOK_BACKOFF_MS: readonly number[] = [
  60_000,            // 1 minute
  5 * 60_000,        // 5 minutes
  30 * 60_000,       // 30 minutes
  2 * 60 * 60_000,   // 2 hours
  6 * 60 * 60_000,   // 6 hours
];

// Consecutive endpoint-wide failures before the dispatcher flips the
// endpoint to active=false. Chosen high enough that transient outages
// (a 30-minute GHL incident) don't auto-disable; low enough that a
// permanently broken URL doesn't keep burning retries for weeks.
const AUTO_DISABLE_THRESHOLD = 20;

const USER_AGENT = "SwiftReach-Webhook/1.0";

// Dispatch gate — see file-header comment.
function dispatchGateStatus(): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      reason:
        "META_APP_SECRET not set — Meta inbound signatures aren't verified. " +
        "Outbound dispatch is DISABLED to prevent forwarding forged payloads.",
    };
  }
  return { ok: true };
}

export interface EmitParams {
  userId: string;
  eventType: WebhookEventType;
  // Stable identifier for deterministic eventId derivation. For Meta
  // status events use `${wamid}|${status}`; for opt-outs use
  // OptOutLog.id; for inbound replies use InboundMessage.id.
  sourceKey: string;

  // Standard payload fields. Caller sets what applies.
  messageId?: string | null;    // Meta wamid
  externalId?: string | null;   // Caller's external_id from trigger
  phone: string;                // E.164 without +
  campaignId?: string | null;   // Campaign id or null
  status?: string | null;       // sent | delivered | read | failed
  replyText?: string | null;    // for message.replied only
  timestamp?: Date;             // Meta's own timestamp where available
}

export async function emitEvent(prisma: PrismaClient, p: EmitParams): Promise<void> {
  const gate = dispatchGateStatus();
  if (!gate.ok) {
    // Logged at warning (not error) so a misconfigured env is visible
    // in the admin dashboard but doesn't page. Dispatch is skipped
    // entirely — no row created.
    await logError("emitEvent-gate", new Error(gate.reason), {
      userId: p.userId,
      severity: "warning",
    });
    return;
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      userId: p.userId,
      active: true,
      // Postgres array `has` filter — matches endpoints where the
      // events[] column contains p.eventType.
      events: { has: p.eventType },
    },
  });
  if (endpoints.length === 0) return;

  const ts = p.timestamp ?? new Date();

  // Parallel fan-out. Each endpoint gets its own deterministic eventId
  // so Meta's retries are idempotent AT PER-ENDPOINT granularity —
  // the same wamid/status pair fanning to two endpoints produces two
  // distinct rows (different endpointIds → different eventIds), but
  // a second Meta call for the same wamid/status finds both eventIds
  // already in the table and no-ops both.
  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const eventId = computeEventId(p.eventType, p.sourceKey, endpoint.id);
      const payload = {
        event: p.eventType,
        event_id: eventId,
        message_id: p.messageId ?? null,
        external_id: p.externalId ?? null,
        phone: p.phone,
        campaign: p.campaignId ?? null,
        status: p.status ?? null,
        reply_text: p.replyText ?? null,
        timestamp: ts.toISOString(),
      };

      // Insert the PENDING row. P2002 (unique violation on eventId) is
      // the normal "Meta retried" path — swallow silently. Everything
      // else is logged and we skip trying to deliver.
      let deliveryId: string;
      try {
        const row = await prisma.webhookDelivery.create({
          data: {
            eventId,
            endpointId: endpoint.id,
            eventType: p.eventType,
            // Prisma's Json field wants InputJsonValue — cast through
            // unknown to satisfy the structural type without coercing.
            payload: payload as unknown as Prisma.InputJsonValue,
            status: "PENDING",
          },
          select: { id: true },
        });
        deliveryId = row.id;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return;
        await logError("emitEvent-insert", err, { userId: p.userId });
        return;
      }

      // Inline first attempt. Caller is expected to wrap the whole
      // emitEvent call in `after()` / waitUntil so a slow POST doesn't
      // block their HTTP response.
      await runAttempt(prisma, deliveryId, endpoint, payload);
    })
  );
}

/**
 * Attempt delivery for a pre-existing WebhookDelivery row. Used by:
 *   - the test-event endpoint (user-triggered, bypasses the gate — the
 *     payload is synthetic so there's no risk of forwarding forged
 *     Meta data to the subscriber)
 *   - the Step 5 retry cron
 *
 * NOT subject to the META_APP_SECRET gate — the delivery row already
 * exists; refusing to retry it would strand it forever. The gate's
 * job is to prevent row CREATION from unverified Meta events.
 */
export async function dispatchDelivery(
  prisma: PrismaClient,
  deliveryId: string
): Promise<void> {
  const row = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!row) return; // deleted since enqueue — nothing to do
  if (!row.endpoint.active) {
    // Endpoint was paused between enqueue and dispatch. Mark the row
    // FAILED (not DEAD) so when the endpoint is re-enabled the retry
    // cron picks it back up.
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        lastError: "Endpoint is paused",
        nextAttemptAt: new Date(Date.now() + WEBHOOK_BACKOFF_MS[0]),
      },
    });
    return;
  }
  const payload = row.payload as unknown as Record<string, unknown>;
  await runAttempt(prisma, row.id, row.endpoint, payload);
}

// ── internals ──────────────────────────────────────────────────────

async function runAttempt(
  prisma: PrismaClient,
  deliveryId: string,
  endpoint: WebhookEndpoint,
  payload: Record<string, unknown>
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  // X-SwiftReach-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
  // The signed input is `${t}.${rawBody}` so a receiver that caches
  // raw bodies can re-sign and compare, and so a replay with a stale
  // timestamp is detectable (receiver can require t within ~5 min of
  // its own clock).
  const sig = createHmac("sha256", endpoint.secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-SwiftReach-Signature": `t=${t},v1=${sig}`,
    "X-SwiftReach-Event": String(payload.event ?? ""),
    "X-SwiftReach-Delivery": String(payload.event_id ?? ""),
  };

  // AbortController-based timeout so a receiver that hangs forever
  // can't tie up the function slot. Promise.race would leak the
  // fetch into the background.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  let responseCode: number | null = null;
  let errorMsg: string | null = null;
  try {
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    responseCode = resp.status;
    if (resp.status < 200 || resp.status >= 300) {
      // Pull a tiny snippet of the body for the lastError field —
      // helps the user debug via the delivery log without exposing
      // megabytes of error-page HTML.
      const snippet = (await safeReadText(resp)).slice(0, 200);
      errorMsg = `HTTP ${resp.status}${snippet ? `: ${snippet}` : ""}`;
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      errorMsg = `Timed out after ${DISPATCH_TIMEOUT_MS}ms`;
    } else {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timer);
  }

  const ok = responseCode !== null && responseCode >= 200 && responseCode < 300;
  await finalizeAttempt(prisma, deliveryId, endpoint.id, {
    ok,
    responseCode,
    errorMsg,
  });
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

interface AttemptResult {
  ok: boolean;
  responseCode: number | null;
  errorMsg: string | null;
}

async function finalizeAttempt(
  prisma: PrismaClient,
  deliveryId: string,
  endpointId: string,
  r: AttemptResult
): Promise<void> {
  if (r.ok) {
    // Transactional: mark DELIVERED + reset the endpoint's rolling
    // failure counter. A successful delivery resets the counter to
    // 0 so an auto-disable only trips on CONSECUTIVE failures.
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DELIVERED",
          attempts: { increment: 1 },
          lastResponseCode: r.responseCode,
          lastError: null,
        },
      }),
      prisma.webhookEndpoint.update({
        where: { id: endpointId },
        data: { failureCount: 0 },
      }),
    ]);
    return;
  }

  // Failure — schedule retry. Read current attempt count, compute
  // next backoff + whether we've exhausted the budget.
  const current = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { attempts: true },
  });
  const attempts = (current?.attempts ?? 0) + 1;
  // After the last backoff slot is used, one more failure → DEAD.
  // WEBHOOK_BACKOFF_MS has 5 entries, so attempts 1..5 → retry,
  // attempt 6 → DEAD.
  const terminal = attempts > WEBHOOK_BACKOFF_MS.length;
  const backoffIdx = Math.min(attempts - 1, WEBHOOK_BACKOFF_MS.length - 1);
  const nextAt = new Date(Date.now() + WEBHOOK_BACKOFF_MS[backoffIdx]);

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: terminal ? "DEAD" : "FAILED",
      attempts,
      lastResponseCode: r.responseCode,
      lastError: r.errorMsg ?? `HTTP ${r.responseCode ?? "?"}`,
      nextAttemptAt: nextAt,
    },
  });

  // Endpoint-level failure counter. Increment, then check whether we
  // crossed the auto-disable threshold. Doing it as read-modify-write
  // has a mild race window (two parallel failures could both see
  // failureCount=19 and only one would trip the threshold), but the
  // consequence is at worst one extra attempt before disable — fine.
  const ep = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: { failureCount: { increment: 1 } },
    select: { failureCount: true, active: true },
  });
  if (ep.failureCount >= AUTO_DISABLE_THRESHOLD && ep.active) {
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { active: false },
    });
    await logError(
      "webhookDispatcher-auto-disable",
      new Error(
        `Endpoint ${endpointId} auto-disabled after ${ep.failureCount} consecutive failures`
      ),
      { severity: "warning" }
    );
    // Follow-up: notify the endpoint owner by email. Deferred —
    // doing it inline would add Resend latency to the dispatcher
    // critical path.
  }
}
