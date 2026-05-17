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

// Parse the sheet at `sheetIndex` (0-based) within an XLSX workbook
// supplied as raw bytes. Throws if the sheet doesn't exist.
export function parseExcelBytes(
  fileName: string,
  bytes: ArrayBuffer | Uint8Array,
  sheetIndex = 0
): ParsedFile {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames[sheetIndex];
  if (!sheetName) {
    throw new Error(
      sheetIndex === 0
        ? "Workbook has no sheets."
        : `Sheet index ${sheetIndex} does not exist. Workbook has ${wb.SheetNames.length} sheet(s).`
    );
  }
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

// ── Sheet detection ──────────────────────────────────────────────────────────
// Used by the New Campaign flow (and Drive imports for Excel) to show a
// sheet picker BEFORE doing a full parse. We deliberately avoid parsing
// every sheet's data — for big workbooks that would block the main thread
// for seconds. We only read row counts, which sheet_to_json computes from
// the workbook's `!ref` range without touching most of the cells.

export interface SheetMeta {
  name: string;
  index: number;
  rowCount: number; // data rows (excludes the header row, never negative)
  isEmpty: boolean;
}

export interface SheetDetection {
  sheets: SheetMeta[];
  needsSelection: boolean; // true when >1 non-empty sheet exists
  defaultSheetIndex: number; // first non-empty sheet, with a preference
                             // for named sheets over generic "Sheet1"
}

const GENERIC_SHEET_NAME_RE = /^Sheet\d+$/i;

function detectSheetsFromWorkbook(
  wb: XLSX.WorkBook
): SheetDetection {
  const sheets: SheetMeta[] = wb.SheetNames.map((name, index) => {
    const ws = wb.Sheets[name];
    // sheet_to_json includes the data rows but not the header row when
    // header:undefined (default object-mode). For consistency we report
    // the data-row count (matches the "87 rows" copy the UI shows).
    const rowCount = ws
      ? (XLSX.utils.sheet_to_json(ws, { defval: "" }) as unknown[]).length
      : 0;
    return {
      name,
      index,
      rowCount,
      isEmpty: rowCount === 0,
    };
  });

  // Prefer the first non-empty sheet, but if that sheet has a generic
  // name (Sheet1/Sheet2…) and another non-empty sheet has a real name,
  // prefer the named one — matches the spec's "MFAC_Members" example.
  const nonEmpty = sheets.filter((s) => !s.isEmpty);
  let defaultSheetIndex = nonEmpty[0]?.index ?? 0;
  if (
    nonEmpty.length > 1 &&
    GENERIC_SHEET_NAME_RE.test(nonEmpty[0]!.name)
  ) {
    const named = nonEmpty.find((s) => !GENERIC_SHEET_NAME_RE.test(s.name));
    if (named) defaultSheetIndex = named.index;
  }

  return {
    sheets,
    needsSelection: nonEmpty.length > 1,
    defaultSheetIndex,
  };
}

export function detectSheetsFromBytes(
  bytes: ArrayBuffer | Uint8Array
): SheetDetection {
  const wb = XLSX.read(bytes, { type: "array" });
  return detectSheetsFromWorkbook(wb);
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

async function parseXLSXFile(file: File, sheetIndex = 0): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  return parseExcelBytes(file.name, buf, sheetIndex);
}

export async function parseContactFile(file: File): Promise<ParsedFile> {
  // Back-compat entry point. Always uses sheet 0 for Excel — callers that
  // want sheet selection should use detectSheets() + parseSheetByIndex().
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) return parseCSVFile(file);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXLSXFile(file);
  throw new Error("Unsupported file type. Use .xlsx, .xlsm, or .csv.");
}

/**
 * Inspect an uploaded file and return the list of sheets without doing the
 * full row parse. CSVs have no sheets — we return a single synthetic entry
 * so callers can use a uniform code path. needsSelection is always false
 * for CSV.
 */
export async function detectSheets(file: File): Promise<SheetDetection> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    // No real sheets — fabricate a single entry so the UI can branch on
    // needsSelection alone. rowCount is unknown without a full parse,
    // which we deliberately don't do here.
    return {
      sheets: [{ name: "CSV", index: 0, rowCount: -1, isEmpty: false }],
      needsSelection: false,
      defaultSheetIndex: 0,
    };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const buf = await file.arrayBuffer();
    return detectSheetsFromBytes(buf);
  }
  throw new Error("Unsupported file type. Use .xlsx, .xlsm, or .csv.");
}

/**
 * Parse a specific sheet by index from an uploaded file. For CSVs the
 * `sheetIndex` is ignored (CSVs have no sheets).
 */
export async function parseSheetByIndex(
  file: File,
  sheetIndex: number
): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) return parseCSVFile(file);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return parseXLSXFile(file, sheetIndex);
  }
  throw new Error("Unsupported file type. Use .xlsx, .xlsm, or .csv.");
}
