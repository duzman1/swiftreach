import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/**
 * One-decimal percent for a numerator/denominator pair. Returns "—"
 * (em dash) rather than "0%", NaN, or Infinity when the denominator
 * is zero — the calendar-month usage reset legitimately zeros
 * counters on the 1st of every month, and "0%" would misread as a
 * real measurement rather than the absence of one.
 */
export function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
