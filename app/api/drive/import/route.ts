// Downloads the user-picked file from Google Drive, parses it with the same
// engine the manual upload uses, and returns the canonical ParsedFile shape so
// the wizard's column-detection step can be fed identically.
//
// The access token is short-lived and supplied by the client (obtained via
// Google Identity Services in the browser). It's used once per import and not
// persisted anywhere.
//
// Multi-sheet handling (added 2026-05):
//   - Google Sheets: if no sheetName is provided, we fetch the tab list via
//     the Sheets API. With 0 tabs we error; with 1 tab we import it directly;
//     with 2+ we return { needsSheetSelection: true, sheets: [...] } so the
//     frontend can render its picker, then re-call us with sheetName set.
//   - Excel from Drive: we download the bytes, detect sheets locally, and
//     apply the same single-vs-multi logic. Selection happens by sheetIndex
//     (passed as the `sheetIndex` field).

import { NextRequest, NextResponse } from "next/server";
import {
  parseExcelBytes,
  parseCsvText,
  detectSheetsFromBytes,
  type ParsedFile,
  type SheetMeta,
} from "@/lib/parseFile";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Plans that may use Google Drive import. Any other value (incl. null /
// "free") is rejected by the gate at the top of POST().
const PAID_PLANS = ["starter", "growth"];

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_CSV = "text/csv";

interface ImportBody {
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  accessToken?: string;
  // Google Sheets: name of the tab to import (preferred — Sheets API
  // values endpoint keys by name not id).
  sheetName?: string;
  // Excel: zero-based index of the workbook sheet to import.
  sheetIndex?: number;
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function mapDriveStatus(status: number): { code: number; message: string } {
  if (status === 401) {
    return { code: 401, message: "Google access token expired. Please reconnect." };
  }
  if (status === 403) {
    return {
      code: 403,
      message:
        "Permission denied. Make sure the file is accessible with your Google account.",
    };
  }
  if (status === 404) {
    return { code: 404, message: "File not found in Google Drive." };
  }
  return { code: status, message: `Google Drive returned ${status}` };
}

async function downloadAsBytes(
  url: string,
  accessToken: string
): Promise<{ bytes: Uint8Array; status: number }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return { bytes: new Uint8Array(), status: res.status };
  }
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), status: 200 };
}

async function downloadAsText(
  url: string,
  accessToken: string
): Promise<{ text: string; status: number }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return { text: "", status: res.status };
  }
  const text = await res.text();
  return { text, status: 200 };
}

// ── Google Sheets helpers ───────────────────────────────────────────────────

interface GoogleSheetProperties {
  sheetId: number;
  title: string;
  index: number;
}
interface GoogleSheetsListResponse {
  sheets?: Array<{ properties: GoogleSheetProperties }>;
}

async function listGoogleSheetTabs(
  fileId: string,
  accessToken: string
): Promise<{ tabs: GoogleSheetProperties[]; status: number }> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}` +
    `?fields=sheets.properties`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return { tabs: [], status: res.status };
  const data = (await res.json()) as GoogleSheetsListResponse;
  const tabs =
    data.sheets
      ?.map((s) => s.properties)
      .sort((a, b) => a.index - b.index) ?? [];
  return { tabs, status: 200 };
}

interface GoogleSheetsValuesResponse {
  values?: string[][];
}

async function fetchGoogleSheetValues(
  fileId: string,
  sheetName: string,
  accessToken: string
): Promise<{ values: string[][]; status: number }> {
  // The values endpoint keys by A1-notation range. Passing just the tab
  // name returns the entire used range. URL-encode the name so tabs
  // with spaces / special chars work.
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}` +
    `/values/${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return { values: [], status: res.status };
  const data = (await res.json()) as GoogleSheetsValuesResponse;
  return { values: data.values ?? [], status: 200 };
}

// Convert a Google Sheets values matrix (row 0 = headers) into ParsedFile.
function parseGoogleSheetValues(
  fileName: string,
  sheetName: string,
  values: string[][]
): ParsedFile {
  const headerRow = values[0] ?? [];
  // Build a synthetic CSV string and let parseCsvText do the
  // sanitisation / typing — saves us reimplementing all the cleanup
  // logic. We CSV-quote every cell so embedded commas/quotes survive.
  const escape = (cell: unknown) =>
    `"${String(cell ?? "").replace(/"/g, '""')}"`;
  const csv = values.map((row) => row.map(escape).join(",")).join("\n");
  const parsed = parseCsvText(fileName, csv);
  // Override the synthetic-source header count check downstream and
  // attach the sheet name for the "sheet \"...\"" chip.
  void headerRow;
  return { ...parsed, sheetName };
}

// ── handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Plan gate — Google Drive import is Starter+. The client-side picker
  // already pre-checks the plan, but enforce here too so a free user
  // can't reach this route via curl/devtools. Response shape matches
  // what the picker's importFile() handler expects on a 403:
  //   { error, upgradeRequired, redirectTo }.
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return bad(401, "Unauthorized");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!PAID_PLANS.includes(user?.plan ?? "free")) {
    return Response.json(
      {
        error: "Google Drive import requires a paid plan.",
        upgradeRequired: true,
        redirectTo: "/billing?feature=google-drive-import",
      },
      { status: 403 }
    );
  }

  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }

  const { fileId, fileName, mimeType, accessToken, sheetName, sheetIndex } =
    body;
  if (!fileId) return bad(400, "Missing fileId");
  if (!accessToken) return bad(401, "Missing Google access token");
  if (!mimeType) return bad(400, "Missing mimeType");
  if (!fileName) return bad(400, "Missing fileName");

  try {
    const isGoogleSheet = mimeType === MIME_GOOGLE_SHEET;
    const isExcel =
      mimeType === MIME_XLSX || mimeType.includes("spreadsheetml");
    const isCsv =
      mimeType === MIME_CSV || fileName.toLowerCase().endsWith(".csv");

    if (!isGoogleSheet && !isExcel && !isCsv) {
      return bad(
        415,
        `Unsupported file type "${mimeType}". Pick a Google Sheet, Excel, or CSV file.`
      );
    }

    // ── CSV path (no sheets concept) ────────────────────────────────────
    if (isCsv) {
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?alt=media`;
      const { text, status } = await downloadAsText(url, accessToken);
      if (status !== 200) {
        const m = mapDriveStatus(status);
        return bad(m.code, m.message);
      }
      if (text.length > MAX_BYTES) {
        return bad(
          413,
          "File is too large. Please reduce to under 10MB or upload directly."
        );
      }
      return validateAndReturn(parseCsvText(fileName, text));
    }

    // ── Google Sheets path ──────────────────────────────────────────────
    if (isGoogleSheet) {
      // If the client didn't pick a tab yet, list tabs first and either
      // import the lone tab automatically or hand the list back for a
      // picker UI.
      if (!sheetName) {
        const { tabs, status } = await listGoogleSheetTabs(fileId, accessToken);
        if (status !== 200) {
          const m = mapDriveStatus(status);
          return bad(m.code, m.message);
        }
        if (tabs.length === 0) {
          return bad(422, "This Google Sheet has no tabs.");
        }
        if (tabs.length === 1) {
          // Skip the picker — import the lone tab directly.
          const onlyTab = tabs[0]!;
          const { values, status: vstatus } = await fetchGoogleSheetValues(
            fileId,
            onlyTab.title,
            accessToken
          );
          if (vstatus !== 200) {
            const m = mapDriveStatus(vstatus);
            return bad(m.code, m.message);
          }
          if (values.length === 0) {
            return bad(
              422,
              "This Google Sheet appears to be empty. Please check your file and try again."
            );
          }
          return validateAndReturn(
            parseGoogleSheetValues(fileName, onlyTab.title, values)
          );
        }
        // Multiple tabs — return the list for the frontend picker.
        return NextResponse.json({
          ok: true,
          needsSheetSelection: true,
          fileId,
          fileName,
          mimeType,
          sheets: tabs.map((t) => ({
            id: t.sheetId,
            name: t.title,
            index: t.index,
          })),
        });
      }

      // Client picked a tab — fetch only its values.
      const { values, status: vstatus } = await fetchGoogleSheetValues(
        fileId,
        sheetName,
        accessToken
      );
      if (vstatus !== 200) {
        const m = mapDriveStatus(vstatus);
        return bad(m.code, m.message);
      }
      if (values.length === 0) {
        return bad(
          422,
          `Sheet "${sheetName}" is empty.`
        );
      }
      return validateAndReturn(
        parseGoogleSheetValues(fileName, sheetName, values)
      );
    }

    // ── Excel from Drive path ───────────────────────────────────────────
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?alt=media`;
    const { bytes, status } = await downloadAsBytes(url, accessToken);
    if (status !== 200) {
      const m = mapDriveStatus(status);
      return bad(m.code, m.message);
    }
    if (bytes.byteLength > MAX_BYTES) {
      return bad(
        413,
        "File is too large. Please reduce to under 10MB or upload directly."
      );
    }
    if (bytes.byteLength === 0) {
      return bad(422, "Drive returned an empty file.");
    }

    // Detect sheets server-side. If the client already specified one,
    // honour it directly; otherwise apply the auto/single/multi rules
    // matching the local FileUpload flow.
    if (typeof sheetIndex === "number") {
      return validateAndReturn(parseExcelBytes(fileName, bytes, sheetIndex));
    }

    const detection = detectSheetsFromBytes(bytes);
    const nonEmpty: SheetMeta[] = detection.sheets.filter((s) => !s.isEmpty);
    if (nonEmpty.length === 0) {
      return bad(
        422,
        "This file appears to be empty. Please check your file and try again."
      );
    }
    if (!detection.needsSelection) {
      return validateAndReturn(
        parseExcelBytes(fileName, bytes, detection.defaultSheetIndex)
      );
    }
    // Multiple non-empty sheets — return the list for the picker.
    return NextResponse.json({
      ok: true,
      needsSheetSelection: true,
      fileId,
      fileName,
      mimeType,
      sheets: detection.sheets.map((s) => ({
        id: s.index,
        name: s.name,
        index: s.index,
        rowCount: s.rowCount,
        isEmpty: s.isEmpty,
      })),
      defaultSheetIndex: detection.defaultSheetIndex,
    });
  } catch (err) {
    return bad(500, err instanceof Error ? err.message : "Import failed");
  }
}

function validateAndReturn(parsed: ParsedFile) {
  if (parsed.headers.length === 0) {
    return bad(
      422,
      "Could not detect column headers. Make sure row 1 contains column names."
    );
  }
  if (parsed.rows.length === 0) {
    return bad(422, "File contains headers but no data rows.");
  }
  return NextResponse.json({ ok: true, parsed });
}
