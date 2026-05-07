// Reads an uploaded contact file (.xlsx, .xlsm, .csv) and returns a normalized
// shape. NEVER renames the meaning of column headers — but we DO clean
// invisible characters (BOM, non-breaking space, zero-width space, leading or
// trailing whitespace, runs of internal whitespace). Excel-saved files often
// contain these, and they cause silent variable-mismatch bugs since they
// render identically to a normal space but don't byte-match.

import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Row = Record<string, string>;

export type ColumnType = "text" | "number" | "date";

export interface SanitizedHeader {
  original: string;
  cleaned: string;
}

export interface ParsedFile {
  fileName: string;
  sheetName?: string;
  headers: string[];                  // sanitized column headers (= keys in rows)
  rows: Row[];                        // each row's values keyed by sanitized header
  columnTypes: Record<string, ColumnType>;
  sanitizedHeaders: SanitizedHeader[]; // headers that were modified during cleanup
}

// Build the cleanup regexes from explicit code points so the source file
// stays free of literal invisible characters.
//
// Zero-width chars to strip:
//   U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 WORD JOINER, U+FEFF BOM/ZWNBSP
// Unicode space chars to convert to U+0020:
//   U+00A0 NBSP, U+2000-U+200A en/em/figure/etc., U+202F NARROW NBSP,
//   U+205F MEDIUM MATH SPACE, U+3000 IDEOGRAPHIC SPACE
const ch = (cp: number) => String.fromCharCode(cp);
const range = (a: number, b: number) => `${ch(a)}-${ch(b)}`;

const ZERO_WIDTH = new RegExp(
  "[" + range(0x200b, 0x200d) + ch(0x2060) + ch(0xfeff) + "]",
  "g"
);

const UNICODE_SPACE = new RegExp(
  "[" +
    ch(0x00a0) +
    range(0x2000, 0x200a) +
    ch(0x202f) +
    ch(0x205f) +
    ch(0x3000) +
    "]",
  "g"
);

export function sanitizeHeader(raw: string): string {
  if (raw == null) return "";
  return String(raw)
    .replace(ZERO_WIDTH, "")
    .replace(UNICODE_SPACE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSanitizedList(originals: string[]): SanitizedHeader[] {
  return originals
    .map((o) => ({ original: o, cleaned: sanitizeHeader(o) }))
    .filter((h) => h.original !== h.cleaned);
}

const DATE_REGEX =
  /^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}\/\d{1,2}\/\d{2,4}|^\d{1,2}-[A-Za-z]{3}-\d{2,4}/;

function detectColumnType(values: string[]): ColumnType {
  const nonEmpty = values.filter((v) => v != null && String(v).trim() !== "");
  if (nonEmpty.length === 0) return "text";

  let numeric = 0;
  let date = 0;
  for (const v of nonEmpty) {
    const s = String(v).trim();
    if (!isNaN(Number(s.replace(/[,$%]/g, "")))) numeric++;
    if (DATE_REGEX.test(s) || !isNaN(Date.parse(s))) date++;
  }
  if (numeric / nonEmpty.length > 0.8) return "number";
  if (date / nonEmpty.length > 0.8) return "date";
  return "text";
}

function buildColumnTypes(headers: string[], rows: Row[]) {
  const types: Record<string, ColumnType> = {};
  for (const h of headers) {
    types[h] = detectColumnType(rows.map((r) => r[h] ?? ""));
  }
  return types;
}

// Re-key a raw row (whose keys may contain invisible chars) onto cleaned
// header keys so downstream code can use the cleaned headers as lookup keys.
function rekeyRow(
  raw: Record<string, unknown>,
  rawHeaders: string[],
  cleanedHeaders: string[]
): Row {
  const out: Row = {};
  for (let i = 0; i < cleanedHeaders.length; i++) {
    const cleaned = cleanedHeaders[i];
    const original = rawHeaders[i];
    const value = raw[original];
    out[cleaned] = value == null ? "" : String(value);
  }
  return out;
}

// ── Buffer/text-based parsers ────────────────────────────────────────────────
// Exposed so server-side code (e.g. Google Drive import) can parse the bytes
// it just downloaded, using the same sanitization/typing logic the browser
// File path uses.

export function parseExcelBytes(
  fileName: string,
  bytes: ArrayBuffer | Uint8Array
): ParsedFile {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const ws = wb.Sheets[sheetName];

  const headerRow = (XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][])[0] as unknown[] | undefined;

  const rawHeaders = (headerRow ?? [])
    .map((h) => (h == null ? "" : String(h)))
    .filter(Boolean);
  const cleanedHeaders = rawHeaders.map(sanitizeHeader);
  const sanitized = buildSanitizedList(rawHeaders);

  const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: false,
    defval: "",
  });

  const rows: Row[] = dataRows.map((r) =>
    rekeyRow(r, rawHeaders, cleanedHeaders)
  );

  return {
    fileName,
    sheetName,
    headers: cleanedHeaders,
    rows,
    columnTypes: buildColumnTypes(cleanedHeaders, rows),
    sanitizedHeaders: sanitized,
  };
}

export function parseCsvText(fileName: string, text: string): ParsedFile {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h,
  });
  const rawHeaders = (result.meta.fields ?? []).filter(Boolean);
  const cleanedHeaders = rawHeaders.map(sanitizeHeader);
  const sanitized = buildSanitizedList(rawHeaders);
  const rows = (result.data ?? []).map((r) =>
    rekeyRow(r, rawHeaders, cleanedHeaders)
  );
  return {
    fileName,
    headers: cleanedHeaders,
    rows,
    columnTypes: buildColumnTypes(cleanedHeaders, rows),
    sanitizedHeaders: sanitized,
  };
}

// ── Browser File-based parsers (existing public API) ─────────────────────────

async function parseCSVFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  return parseCsvText(file.name, text);
}

async function parseXLSXFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  return parseExcelBytes(file.name, buf);
}

export async function parseContactFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) return parseCSVFile(file);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXLSXFile(file);
  throw new Error("Unsupported file type. Use .xlsx, .xlsm, or .csv.");
}
