// Calendar-month usage-period helpers.
//
// Every user's message counter resets on the 1st of each calendar
// month at 00:00 UTC, regardless of plan, billing interval, or
// signup date. Stripe billing anniversaries do not participate.
//
// This module is the single definition of "what month are we in"
// and "when does the next reset happen". Import from here anywhere
// you need those dates so display + enforcement can't drift.

/**
 * The 00:00-UTC start of the calendar month containing `d`.
 * e.g. any date in September 2026 → 2026-09-01T00:00:00.000Z.
 */
export function firstOfMonthUtc(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * The 00:00-UTC start of the calendar month AFTER the one containing
 * `d`. This is the "usage resets" date shown to users.
 * e.g. any date in September 2026 → 2026-10-01T00:00:00.000Z.
 */
export function firstOfNextMonthUtc(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * True iff `usagePeriodStart` is in an earlier calendar month (UTC)
 * than `now`. Used by callers to decide whether the counter needs
 * to be zeroed and the period advanced. Multi-month gaps collapse
 * to a single reset — no per-month iteration.
 */
export function isUsagePeriodExpired(
  usagePeriodStart: Date,
  now: Date = new Date()
): boolean {
  return firstOfMonthUtc(usagePeriodStart).getTime() <
    firstOfMonthUtc(now).getTime();
}

/**
 * Human-friendly "Resets <Month> 1" copy for the date returned by
 * firstOfNextMonthUtc(). Renders in the viewer's locale for the
 * month name; the day is always literal "1" since the UTC 1st is
 * often the previous day in the viewer's local zone (e.g. UTC-05:00
 * would see Aug 31 for a Sep-01 UTC date), and we want the copy to
 * match the actual reset boundary.
 */
export function formatResetDate(next: Date): string {
  const month = next.toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  });
  return `${month} 1`;
}
