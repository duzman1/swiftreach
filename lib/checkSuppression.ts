// The single-point suppression check that EVERY send path must call
// before dispatching a WhatsApp message. If this returns
// { suppress: true }, the message MUST NOT go out.
//
// The whole compliance story rides on this being the one and only
// door. If a new send path is added and it does not consult this
// helper, opt-outs stop meaning anything on that surface. Keep it
// so, and cite this comment when reviewing new send code.
//
// Enforcement order (both are gates — either suppresses):
//   1. DoNotContact (phone-level, per-user). Survives contact
//      deletion + re-import; this is why we added it. A number
//      here means STOP was said at some point, period.
//   2. SavedContact.optedOut. The live per-contact flag —
//      redundant belt with the DNC braces, kept for the rare
//      case where a user manually toggles the flag from the UI
//      without a webhook event that would have written DNC.
//
// Every suppression writes a SuppressionLog row so we have proof.
// The row is written EVEN WHEN the caller is a surface that used
// to fail silently (finding 4 — automations) — auditing is the
// point.
//
// Rate-limit / cost: DNC lookup is a single indexed row per phone.
// Fine for single sends. For bulk sends (campaign loop, scheduled
// materialiser), prefer the bulk variant `loadSuppressedSet()`
// which pulls both lists once and returns a Set for O(1) membership
// checks — same behaviour, one query instead of N.

import type { PrismaClient } from "@prisma/client";

export type SuppressionSurface =
  | "campaign"
  | "scheduled"
  | "automation"
  | "inbox_reply"
  | "single_send"
  | "webhook";

export type SuppressionReason = "opted_out" | "do_not_contact" | "invalid_number";

export interface SuppressionDecision {
  suppress: boolean;
  reason?: SuppressionReason;
}

export interface CheckOptions {
  userId: string;
  phoneNumber: string;
  surface: SuppressionSurface;
  campaignId?: string | null;
  automationId?: string | null;
  /** When true (default), a suppression writes a SuppressionLog row.
   *  Pass false ONLY for pre-flight preview counts (e.g. the wizard's
   *  "N unverified" tally) — those aren't real send attempts and
   *  shouldn't inflate the audit trail. */
  logIfSuppressed?: boolean;
}

/** Single-phone check. Returns the decision AND (if suppress + logging
 *  is on) writes the audit row inline. Callers should NOT double-log. */
export async function checkSuppression(
  prisma: PrismaClient,
  opts: CheckOptions
): Promise<SuppressionDecision> {
  const logIfSuppressed = opts.logIfSuppressed !== false;

  // DNC first — the persistent authority. A row here overrides
  // anything the contact record says.
  const dnc = await prisma.doNotContact.findUnique({
    where: {
      userId_phoneNumber: {
        userId: opts.userId,
        phoneNumber: opts.phoneNumber,
      },
    },
    select: { id: true },
  });
  if (dnc) {
    if (logIfSuppressed) await writeLog(prisma, opts, "do_not_contact");
    return { suppress: true, reason: "do_not_contact" };
  }

  // Fall back to SavedContact.optedOut. In practice DNC is written
  // at every opt-out point, so this branch mostly catches accounts
  // whose opt-outs predate DNC (backfilled) or a manual UI toggle
  // that a future write path hasn't yet flushed to DNC.
  const contact = await prisma.savedContact.findUnique({
    where: {
      userId_phoneNumber: {
        userId: opts.userId,
        phoneNumber: opts.phoneNumber,
      },
    },
    select: { optedOut: true },
  });
  if (contact?.optedOut) {
    if (logIfSuppressed) await writeLog(prisma, opts, "opted_out");
    return { suppress: true, reason: "opted_out" };
  }

  return { suppress: false };
}

/** Bulk pre-load: returns a Set of phoneNumbers that are suppressed
 *  for the given user. Use in campaign / scheduled loops instead of
 *  N single lookups. Does NOT write logs — call `logSuppressed()`
 *  once you've decided which of the matched rows are actually being
 *  suppressed (so you don't inflate the log for phones that weren't
 *  going to be sent to anyway). */
export async function loadSuppressedSet(
  prisma: PrismaClient,
  userId: string
): Promise<Set<string>> {
  const [dncRows, optedOutRows] = await Promise.all([
    prisma.doNotContact.findMany({
      where: { userId },
      select: { phoneNumber: true },
    }),
    prisma.savedContact.findMany({
      where: { userId, optedOut: true },
      select: { phoneNumber: true },
    }),
  ]);
  const set = new Set<string>();
  for (const r of dncRows) set.add(r.phoneNumber);
  for (const r of optedOutRows) set.add(r.phoneNumber);
  return set;
}

/** Write suppression logs in bulk. Used by campaign / scheduled loops
 *  after they've marked contacts as skipped — one insertMany is far
 *  cheaper than N single writes. */
export async function logSuppressed(
  prisma: PrismaClient,
  entries: Array<{
    userId: string;
    phoneNumber: string;
    surface: SuppressionSurface;
    reason: SuppressionReason;
    campaignId?: string | null;
    automationId?: string | null;
  }>
): Promise<void> {
  if (entries.length === 0) return;
  await prisma.suppressionLog.createMany({
    data: entries.map((e) => ({
      userId: e.userId,
      phoneNumber: e.phoneNumber,
      surface: e.surface,
      reason: e.reason,
      campaignId: e.campaignId ?? null,
      automationId: e.automationId ?? null,
    })),
  });
}

/** Convenience: given a bulk-loaded Set from loadSuppressedSet,
 *  classify why each suppressed phone was suppressed (DNC vs
 *  optedOut) so the log rows carry the right reason. Called by the
 *  campaign + scheduled loops after they've built the skipped list. */
export async function classifySuppressions(
  prisma: PrismaClient,
  userId: string,
  phones: string[]
): Promise<Map<string, SuppressionReason>> {
  const out = new Map<string, SuppressionReason>();
  if (phones.length === 0) return out;
  const [dncRows, optedRows] = await Promise.all([
    prisma.doNotContact.findMany({
      where: { userId, phoneNumber: { in: phones } },
      select: { phoneNumber: true },
    }),
    prisma.savedContact.findMany({
      where: { userId, phoneNumber: { in: phones }, optedOut: true },
      select: { phoneNumber: true },
    }),
  ]);
  // DNC wins the label if both hit — it's the persistent authority.
  for (const r of optedRows) out.set(r.phoneNumber, "opted_out");
  for (const r of dncRows) out.set(r.phoneNumber, "do_not_contact");
  return out;
}

async function writeLog(
  prisma: PrismaClient,
  opts: CheckOptions,
  reason: SuppressionReason
): Promise<void> {
  try {
    await prisma.suppressionLog.create({
      data: {
        userId: opts.userId,
        phoneNumber: opts.phoneNumber,
        surface: opts.surface,
        reason,
        campaignId: opts.campaignId ?? null,
        automationId: opts.automationId ?? null,
      },
    });
  } catch {
    // NEVER let a logging failure block the suppression decision.
    // The refusal to send is the primary safety guarantee; the log
    // is the paper trail. If the DB has hiccuped, still refuse.
  }
}
