// List the tabs (sheets) of a Google Sheets file so the frontend can
// show a sheet picker before doing the full import.
//
// Used by GoogleDrivePicker when the user picks a file with
// mimeType === application/vnd.google-apps.spreadsheet. For regular
// Excel files from Drive we detect sheets inside /api/drive/import
// (we already have the bytes there).
//
// Auth: same Clerk session + paid-plan gate as /api/drive/import.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAID_PLANS = ["starter", "growth"];

interface RequestBody {
  fileId?: string;
  accessToken?: string;
}

interface GoogleSheetProperties {
  sheetId: number;
  title: string;
  index: number;
  gridProperties?: {
    rowCount?: number;
    columnCount?: number;
  };
}

interface GoogleSheetsResponse {
  sheets?: Array<{ properties: GoogleSheetProperties }>;
  error?: { message?: string };
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      {
        error: "Google Drive import requires a paid plan.",
        upgradeRequired: true,
        redirectTo: "/billing?feature=google-drive-import",
      },
      { status: 403 }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }

  const { fileId, accessToken } = body;
  if (!fileId) return bad(400, "Missing fileId");
  if (!accessToken) return bad(401, "Missing Google access token");

  try {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}` +
      `?fields=sheets.properties`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (res.status === 401) {
      return bad(401, "Google access token expired. Please reconnect.");
    }
    if (res.status === 403) {
      return bad(
        403,
        "Permission denied. Make sure the file is accessible with your Google account."
      );
    }
    if (res.status === 404) {
      return bad(404, "Sheet not found in Google Drive.");
    }
    if (!res.ok) {
      return bad(res.status, `Google Sheets returned ${res.status}`);
    }

    const data = (await res.json()) as GoogleSheetsResponse;
    const sheets =
      data.sheets
        ?.map((s) => {
          // gridProperties.rowCount is the dimensioned size of the tab —
          // typically 1000 even for an empty sheet — so it's a UPPER
          // bound, not the "rows with data" count. We expose it as-is
          // and let the import endpoint compute the real count by
          // fetching values for the chosen tab. We DO surface a coarse
          // isLikelyEmpty hint based on a 1x1 dimension.
          const rowCount = s.properties.gridProperties?.rowCount ?? 0;
          const colCount = s.properties.gridProperties?.columnCount ?? 0;
          return {
            id: s.properties.sheetId,
            name: s.properties.title,
            index: s.properties.index,
            rowCount, // grid dimension, not data count
            isLikelyEmpty: rowCount <= 1 || colCount === 0,
          };
        })
        .sort((a, b) => a.index - b.index) ?? [];

    return NextResponse.json({ ok: true, sheets });
  } catch (err) {
    return bad(
      500,
      err instanceof Error ? err.message : "Failed to fetch sheet list"
    );
  }
}
