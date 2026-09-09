// Do-Not-Contact list: GET for viewing, DELETE for manual clear.
// Exporting: pass ?format=csv for a CSV download. Every plan.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 10_000;

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    if (format === "csv") {
      // Full export, capped so a runaway list can't wedge the request.
      // The cap is generous — a user with more than 10k opt-outs has
      // bigger problems than pagination.
      const rows = await prisma.doNotContact.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: MAX_EXPORT_ROWS,
      });
      const header = ["phoneNumber", "reason", "addedAt", "sourceOptOutId"];
      const lines: string[] = [header.map(csvEscape).join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.phoneNumber,
            r.reason,
            r.createdAt.toISOString(),
            r.sourceOptOutId ?? "",
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="do-not-contact-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // JSON listing — paginated cursor via ?after=<createdAt-iso>.
    const after = url.searchParams.get("after");
    const where = after
      ? { userId, createdAt: { lt: new Date(after) } }
      : { userId };
    const rows = await prisma.doNotContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    return NextResponse.json({
      ok: true,
      rows: page,
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/compliance/dnc");
  }
}

// Manual DNC clear — used only when someone re-consented outside the
// system and the user wants to allow future sends. Also flips the
// contact's optedOut flag if present, so the two sources of truth
// stay aligned. Never used by the auto-opt-out path.
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    let body: { phoneNumber?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    if (!body.phoneNumber?.trim()) return errorResponse("phoneNumber is required", 400);
    const phone = body.phoneNumber.trim();

    // Delete DNC row (no-op if missing).
    await prisma.doNotContact
      .delete({ where: { userId_phoneNumber: { userId, phoneNumber: phone } } })
      .catch(() => undefined);
    // And clear the contact-level flag if present.
    await prisma.savedContact
      .updateMany({
        where: { userId, phoneNumber: phone, optedOut: true },
        data: { optedOut: false, optedOutAt: null },
      })
      .catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/compliance/dnc");
  }
}
