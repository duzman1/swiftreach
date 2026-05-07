// Substitution engine. Pure functions. NEVER assumes any variable name —
// works entirely from whatever's in the runtime varPool.

export type FormatRule = "raw" | "dollar" | "comma" | "percent" | "date";

export const FORMAT_RULES: { value: FormatRule; label: string; example: string }[] = [
  { value: "raw", label: "Raw", example: "150" },
  { value: "dollar", label: "Dollar", example: "$150.00" },
  { value: "comma", label: "Thousands", example: "1,500" },
  { value: "percent", label: "Percent", example: "15.0%" },
  { value: "date", label: "Date", example: "5/4/2026" },
];

export function applyFormat(value: string, format?: FormatRule): string {
  if (value == null) return "";
  if (!format || format === "raw") return String(value);

  const stringValue = String(value).trim();
  if (stringValue === "") return "";

  if (format === "dollar") {
    const n = parseFloat(stringValue.replace(/[,$]/g, ""));
    if (isNaN(n)) return stringValue;
    return `$${n.toFixed(2)}`;
  }
  if (format === "comma") {
    const n = parseFloat(stringValue.replace(/[,$]/g, ""));
    if (isNaN(n)) return stringValue;
    return n.toLocaleString();
  }
  if (format === "percent") {
    const n = parseFloat(stringValue.replace(/[,%]/g, ""));
    if (isNaN(n)) return stringValue;
    return `${n.toFixed(1)}%`;
  }
  if (format === "date") {
    const d = new Date(stringValue);
    if (isNaN(d.getTime())) return stringValue;
    return d.toLocaleDateString();
  }
  return stringValue;
}

const TOKEN_REGEX = /\{\{([^}]+)\}\}/g;

export interface BuildMessageInput {
  template: string;
  rowData: Record<string, string>;
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
}

export function buildMessage({
  template,
  rowData,
  staticVars = {},
  formatRules = {},
}: BuildMessageInput): string {
  // rowData wins over staticVars when names collide — per spec.
  const varPool: Record<string, string> = { ...staticVars, ...rowData };

  return template.replace(TOKEN_REGEX, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (!(key in varPool)) return match; // preserve unknown tokens as-is
    return applyFormat(varPool[key], formatRules[key]);
  });
}

export interface ValidationResult {
  tokens: string[];      // every token that appears, in order, with duplicates
  unique: string[];      // unique token names
  resolved: string[];    // unique tokens present in pool
  unknown: string[];     // unique tokens NOT present in pool
  isValid: boolean;
}

export function validateTemplate(
  template: string,
  rowData: Record<string, string>,
  staticVars: Record<string, string> = {}
): ValidationResult {
  const varPool: Record<string, string> = { ...staticVars, ...rowData };
  const tokens: string[] = [];
  for (const match of template.matchAll(TOKEN_REGEX)) {
    tokens.push(match[1].trim());
  }
  const unique = Array.from(new Set(tokens));
  const resolved = unique.filter((t) => t in varPool);
  const unknown = unique.filter((t) => !(t in varPool));
  return {
    tokens,
    unique,
    resolved,
    unknown,
    isValid: tokens.length > 0 && unknown.length === 0,
  };
}

// Helper used by the highlighting overlay — returns a flat list of segments
// describing where tokens land in the source text.
export interface TokenSpan {
  start: number;
  end: number;
  name: string;
  resolved: boolean;
}

export function findTokenSpans(
  template: string,
  rowData: Record<string, string>,
  staticVars: Record<string, string> = {}
): TokenSpan[] {
  const varPool: Record<string, string> = { ...staticVars, ...rowData };
  const out: TokenSpan[] = [];
  for (const match of template.matchAll(TOKEN_REGEX)) {
    const name = match[1].trim();
    out.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      name,
      resolved: name in varPool,
    });
  }
  return out;
}
