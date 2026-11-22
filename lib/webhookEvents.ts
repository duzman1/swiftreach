// Shared constants for the outbound webhook subsystem. Importing
// from one place keeps the CRUD route (Step 3), the dispatcher
// (Step 4), the retry worker (Step 5), and the Settings UI (Step 6)
// in agreement about which event types exist. Adding a new event
// anywhere means adding it here first.
//
// Deterministic event_id helper is also here because every site that
// creates a WebhookDelivery row needs to compute the same id for the
// same (source, status, endpoint) tuple — otherwise Meta's own
// status retries would mint duplicate deliveries.

import { createHash } from "node:crypto";

export const WEBHOOK_EVENT_TYPES = [
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.replied",
  "contact.opted_out",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isKnownEventType(v: unknown): v is WebhookEventType {
  return typeof v === "string" && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(v);
}

/**
 * Compute a deterministic eventId for the WebhookDelivery row.
 *
 * Uses UUIDv5-style namespacing (sha1 under the hood, formatted as a
 * uuid string) so a given (kind, key, endpointId) always hashes to
 * the same id. Downstream of Meta's inbound retries this means a
 * late-arriving "delivered" callback for a wamid we already processed
 * tries to insert the SAME eventId and bounces off the UNIQUE
 * constraint — no duplicate dispatch to the subscriber.
 *
 * `kind` is a short discriminator so (wamid=X, status=delivered) and
 * (wamid=X, status=read) produce distinct ids. `key` is whatever
 * stable identity the source already has: wamid for Meta status
 * events, OptOutLog.id for opt-outs, OutboundReply.id for inbox
 * replies. endpointId scopes to a single subscriber — the same event
 * fans out to N endpoints and gets N different ids.
 */
export function computeEventId(
  kind: string,
  key: string,
  endpointId: string
): string {
  const input = `${kind}|${key}|${endpointId}`;
  const h = createHash("sha256").update(input).digest("hex");
  // Format the first 32 hex chars as a UUID — purely cosmetic; the
  // uniqueness comes from the full hash input. Uses v5 bits in the
  // standard positions so external tooling that validates "looks
  // like a uuid" stays happy.
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-5" +
    h.slice(13, 16) +
    "-" +
    // Variant bits: 10xx → 8/9/a/b
    (((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")) +
    h.slice(18, 20) +
    "-" +
    h.slice(20, 32)
  );
}
