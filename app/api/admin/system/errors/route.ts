// ErrorLog reader + clearer for /admin/system.
// GET — most recent 100 errors (paginate later if it ever matters).
// DELETE — clear all errors. Used by the "Clear errors" button. Confirmed
//          on the client; we don't add a confirm-token round-trip.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const severity = url.searchParams.get("severity") ?? "";
    const where = severity ? { severity } : undefined;

    const errors = await prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        route: true,
        message: true,
        stack: true,
        userId: true,
        severity: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, errors });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/system/errors");
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    const result = await prisma.errorLog.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/system/errors");
  }
}
