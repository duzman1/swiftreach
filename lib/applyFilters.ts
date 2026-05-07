// Optional contact filters for the campaign — let the user send to a subset
// without editing the file. Operators are kept simple and column-agnostic.

import type { Row } from "./parseFile";

export type FilterOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";

export interface FilterRule {
  column: string;
  op: FilterOp;
  value: string;
}

export const FILTER_OPS: { value: FilterOp; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "does not equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "greater_than", label: "greater than", needsValue: true },
  { value: "less_than", label: "less than", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

function asNumber(v: string): number | null {
  if (v == null || v === "") return null;
  const cleaned = String(v).replace(/[,$%\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function rowMatches(row: Row, rule: FilterRule): boolean {
  const cell = String(row[rule.column] ?? "").trim();
  const target = String(rule.value ?? "").trim();
  switch (rule.op) {
    case "equals":
      return cell.toLowerCase() === target.toLowerCase();
    case "not_equals":
      return cell.toLowerCase() !== target.toLowerCase();
    case "contains":
      return cell.toLowerCase().includes(target.toLowerCase());
    case "greater_than": {
      const a = asNumber(cell);
      const b = asNumber(target);
      return a != null && b != null && a > b;
    }
    case "less_than": {
      const a = asNumber(cell);
      const b = asNumber(target);
      return a != null && b != null && a < b;
    }
    case "is_empty":
      return cell === "";
    case "is_not_empty":
      return cell !== "";
  }
}

// AND logic across all rules.
export function applyFilters(rows: Row[], rules: FilterRule[]): Row[] {
  const active = rules.filter((r) => r.column);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((rule) => rowMatches(row, rule)));
}

export function countMatching(rows: Row[], rules: FilterRule[]): number {
  return applyFilters(rows, rules).length;
}
