// Date parsing utilities for the automation engine.
//
// The engine only cares about month+day (recurring yearly), never
// year, so all helpers return {month, day} pairs.
//
// Applied review-note fixes:
//   1. parseInt(x, 10) with radix everywhere — defensive against
//      octal interpretation of leading-zero strings on old runtimes.
//   2. US-first for slash + dash formats. `5/6/2026` and `5-6-2026`
//      both parse as May 6 (SwiftReach's primary audience is US).
//   3. Fallback `new Date(str)` accepts a result only if the input
//      contains at least one digit AND one separator ('-', '/', or
//      space). Prevents "today", "next tuesday", or bare years from
//      being silently accepted.
//   4. Leap-year handling for Feb 29 is a matcher concern, not a
//      parser one — see matchesTodayMonthDay() below.

export interface MonthDay {
  month: number; // 1-12
  day: number; // 1-31
}

export function parseDateToMonthDay(dateStr: string): MonthDay | null {
  if (!dateStr?.trim()) return null;
  const str = dateStr.trim();

  // MM/DD/YYYY | MM/DD/YY | MM/DD  — US-first slash format
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (slashMatch) {
    return {
      month: parseInt(slashMatch[1], 10),
      day: parseInt(slashMatch[2], 10),
    };
  }

  // YYYY-MM-DD (ISO)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    };
  }

  // MM-DD-YYYY | MM-DD-YY  — US-first dash format (flipped from
  // spec's DD-MM-YYYY per user's review note; SwiftReach's audience
  // is US-heavy and treating `5-6-2026` as June 5 would surprise
  // users whose Excel exports date-formatted cells as `MM-DD-YYYY`).
  const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    return {
      month: parseInt(dashMatch[1], 10),
      day: parseInt(dashMatch[2], 10),
    };
  }

  // "Month DD YYYY" | "Month DD, YYYY" | "Month DD"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const wordMatch = str
    .toLowerCase()
    .match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+\d{2,4})?$/);
  if (wordMatch) {
    const monthIdx = monthNames.indexOf(wordMatch[1]);
    if (monthIdx !== -1) {
      return { month: monthIdx + 1, day: parseInt(wordMatch[2], 10) };
    }
  }

  // Final fallback: only accept native Date parse if input looks
  // like an actual date (at least one digit AND at least one
  // separator). Blocks "today", "yesterday", bare years like
  // "1985", and other loose inputs Date() would happily accept.
  const hasDigit = /\d/.test(str);
  const hasSeparator = /[-\/\s]/.test(str);
  if (hasDigit && hasSeparator) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return {
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
      };
    }
  }

  return null;
}

export function getTodayMonthDay(): MonthDay {
  const today = new Date();
  return {
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

export function formatMonthDay(month: number, day: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const idx = month - 1;
  if (idx < 0 || idx > 11) return `${month}/${day}`;
  return `${months[idx]} ${day}`;
}

// Compute the effective (month, day) pairs that the daily cron
// should treat as "today" for automation matching.
//
// Normally returns just one pair — today's date. On Feb 28 in a
// non-leap year, returns BOTH Feb 28 and Feb 29 so that Feb-29
// contacts still get their message on the closest valid day.
// On Feb 29 in a leap year, only returns Feb 29 (Feb-28 contacts
// get their message on the actual 28th).
export function getMatchingDatesForToday(): MonthDay[] {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  const dates: MonthDay[] = [{ month, day }];

  // If today is Feb 28 and this year is NOT a leap year, also
  // match Feb 29 birthdays so those contacts don't skip a year.
  if (month === 2 && day === 28 && !isLeap) {
    dates.push({ month: 2, day: 29 });
  }

  return dates;
}
