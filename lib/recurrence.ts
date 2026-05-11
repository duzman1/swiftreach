// Recurrence math for ScheduledCampaign. Given a "this run happened at"
// timestamp, returns the next time the same campaign should fire — or null
// if it isn't recurring.
//
// Rules:
//   daily   — same time every day
//   weekly  — `recurrenceDay` is 0 (Sunday) ... 6 (Saturday); rolls forward
//             to the next occurrence of that weekday at the same time of day
//   monthly — `recurrenceDay` is 1..31; rolls to the next month at that
//             day-of-month + same time of day. Days that don't exist (e.g.
//             31 in February) clamp to the last day of the target month.

export type Recurrence = "daily" | "weekly" | "monthly";

export function computeNextRunAt(opts: {
  ranAt: Date;
  recurrence: Recurrence | null | undefined;
  recurrenceDay: number | null | undefined;
}): Date | null {
  const { ranAt, recurrence, recurrenceDay } = opts;
  if (!recurrence) return null;

  // Anchor the time-of-day to the run that just happened so the campaign
  // keeps firing at (roughly) the same wall-clock time across weeks/months.
  const hh = ranAt.getUTCHours();
  const mm = ranAt.getUTCMinutes();
  const ss = ranAt.getUTCSeconds();

  if (recurrence === "daily") {
    const d = new Date(ranAt);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hh, mm, ss, 0);
    return d;
  }

  if (recurrence === "weekly") {
    const targetDow = clamp(recurrenceDay ?? ranAt.getUTCDay(), 0, 6);
    const d = new Date(ranAt);
    // Always advance at least one day so we don't immediately re-fire on
    // the same weekday.
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() !== targetDow) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    d.setUTCHours(hh, mm, ss, 0);
    return d;
  }

  if (recurrence === "monthly") {
    const targetDom = clamp(recurrenceDay ?? ranAt.getUTCDate(), 1, 31);
    const d = new Date(ranAt);
    // Move to the first of next month, then clamp to the requested day.
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth());
    d.setUTCDate(Math.min(targetDom, lastDay));
    d.setUTCHours(hh, mm, ss, 0);
    return d;
  }

  return null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function lastDayOfMonth(year: number, monthZeroIndexed: number): number {
  // Day 0 of next month === last day of this month.
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}
