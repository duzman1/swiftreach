// Shared analytics primitives. Every helper takes `userId` and applies
// it as a filter — analytics endpoints must NEVER return cross-user
// data (Phase 6 critical rule #4).
//
// Date range parsing accepts the same shape across every endpoint so
// the client can swap "7d" / "30d" / "90d" / custom from one selector.

export type Range = "7d" | "30d" | "90d" | "custom";

export interface RangeWindow {
  start: Date;
  end: Date;
  days: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseRange(searchParams: URLSearchParams): RangeWindow {
  const range = (searchParams.get("range") ?? "30d") as Range;
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");

  if (range === "custom" && startStr && endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const days = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
      );
      return { start, end, days };
    }
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * MS_PER_DAY);
  return { start, end, days };
}

/** Build a Map<YYYY-MM-DD, 0> with one entry per day in [start, end]. */
export function emptyDailySeries(window: RangeWindow): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < window.days; i++) {
    const d = new Date(window.end.getTime() - i * MS_PER_DAY);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  // Re-order ascending — Map preserves insertion, so reverse first.
  return new Map(Array.from(map).reverse());
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Read-rate as a percentage, safe for zero denominators.
 *
 * Returns 0 for zero-denominator inputs — analytics API payloads are
 * numbers, and the UI decides how to render 0 vs "no data" (e.g. the
 * campaign table shows "—" when `sent === 0`). Never NaN or Infinity.
 */
export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}
