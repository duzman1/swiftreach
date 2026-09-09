// Pure attribution logic — extracted from lib/optOut.ts so unit
// tests can import it without dragging Prisma in. See the scoping-
// rule comment block at the top of lib/report/reportData.ts for how
// this value + function fit into the per-client reporting story.
//
// Both the live detector (lib/optOut.ts.attributeOptOut) and the
// unit tests (__tests__/optOutAttribution.test.ts) import from
// here — there is only one implementation.

/**
 * How far back the opt-out attribution lookup will look for a
 * matching campaign send. An opt-out arriving > N days after this
 * user's most recent send to that phone is treated as unrelated to
 * any campaign — OptOutLog.campaignId stays null and the row is
 * excluded from every client-filtered report.
 *
 * N=30 chosen because WhatsApp's customer-service window is 24h —
 * real reactions cluster tightly inside that, and 30 days is
 * enough to capture delayed replies without misattributing
 * coincidental opt-outs from unrelated triggers months later.
 */
export const OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS = 30;

/** Send record shape the attribution logic works on. Matches the
 *  Prisma lookup shape in lib/optOut.ts. */
export interface AttributableSend {
  campaignId: string;
  sentAt: Date;
}

/**
 * Given a list of candidate sends to a phone, an opt-out timestamp,
 * and the lookback cap, return the send that "caused" the opt-out
 * (most recent send at or before the opt-out, within the lookback
 * window), or null when none qualify.
 *
 * Semantics:
 *   - Only sends with sentAt <= optOutAt are eligible (a send AFTER
 *     the opt-out cannot have caused it).
 *   - Of eligible sends, the most recent wins.
 *   - The winner's gap to the opt-out must be <= lookbackDays. Both
 *     bounds are inclusive — a send exactly at the boundary
 *     attributes; a send one millisecond earlier does not.
 *   - The `sends` argument may be in any order; this function does
 *     not mutate it.
 */
export function pickAttributedCampaign(
  sends: AttributableSend[],
  optOutAt: Date,
  lookbackDays: number = OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS
): AttributableSend | null {
  const cutoff = new Date(
    optOutAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000
  );
  let best: AttributableSend | null = null;
  for (const s of sends) {
    if (s.sentAt > optOutAt) continue; // future send — can't have caused it
    if (s.sentAt < cutoff) continue;   // outside lookback window
    if (!best || s.sentAt > best.sentAt) best = s;
  }
  return best;
}
