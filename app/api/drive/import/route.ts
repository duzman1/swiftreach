// Downloads the user-picked file from Google Drive, parses it with the same
// engine the manual upload uses, and returns the canonical ParsedFile shape so
// the wizard's column-detection step can be fed identically.
//
// The access token is short-lived and supplied by the client (obtained via
// Google Identity Services in the browser). It's used once per import and not
// persisted anywhere.

import { NextRequest, NextResponse } from "next/server";
import { parseExcelBytes, parseCsvText } from "@/lib/parseFile";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/apiResponse";

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

export async function POST(req: NextRequest) {
  // Plan gate — Google Drive import is Starter+. The client-side picker
  // already pre-checks the plan, but enforce here too so a free user
  // can't reach this route via curl/devtools.
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return bad(401, "Unauthorized");
  }
  if (user.plan === "free") {
    return errorResponse(
      "Google Drive import requires Starter or Growth plan",
      403
    );
  }

  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }

  const { fileId, fileName, mimeType, accessToken } = body;
  if (!fileId) return bad(400, "Missing fileId");
  if (!accessToken) return bad(401, "Missing Google access token");
  if (!mimeType) return bad(400, "Missing mimeType");
  if (!fileName) return bad(400, "Missing fileName");

  try {
    // 1. Decide download strategy by mimeType
    const isGoogleSheet = mimeType === MIME_GOOGLE_SHEET;
    const isExcel =
      mimeType === MIME_XLSX || mimeType.includes("spreadsheetml");
    const isCsv =
      mimeType === MIME_CSV ||
      fileName.toLowerCase().endsWith(".csv");

    if (!isGoogleSheet && !isExcel && !isCsv) {
      return bad(
        415,
        `Unsupported file type "${mimeType}". Pick a Google Sheet, Excel, or CSV file.`
      );
    }

    // 2. Pull the bytes/text from Drive
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
      const parsed = parseCsvText(fileName, text);
      return validateAndReturn(parsed);
    }

    // Google Sheet → export endpoint as XLSX
    // Plain Excel → media download
    const url = isGoogleSheet
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          fileId
        )}/export?mimeType=${encodeURIComponent(MIME_XLSX)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
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

    const parsed = parseExcelBytes(fileName, bytes);
    return validateAndReturn(parsed);
  } catch (err) {
    return bad(500, err instanceof Error ? err.message : "Import failed");
  }
}

function validateAndReturn(parsed: ReturnType<typeof parseCsvText>) {
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
