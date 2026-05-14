// Admin per-request detail + update.
//
// GET — full request body + customer details for the modal.
// PUT — update status / admin notes. Status `resolved` stamps
//       resolvedAt; flipping back to open / in_progress clears it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const request = await prisma.supportRequest.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            plan: true,
          },
        },
      },
    });
    if (!request) return bad("Support request not found", 404);
    return NextResponse.json({ ok: true, request });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/[id]");
  }
}

interface UpdateBody {
  status?: string;
  adminNotes?: string | null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!(VALID_STATUSES as readonly string[]).includes(body.status)) {
        return bad(
          `status must be one of: ${VALID_STATUSES.join(", ")}`
        );
      }
      data.status = body.status;
      // Stamp resolvedAt when first resolved; clear it if reopened.
      if (body.status === "resolved") data.resolvedAt = new Date();
      else if (body.status === "open" || body.status === "in_progress")
        data.resolvedAt = null;
    }
    if (body.adminNotes !== undefined) {
      data.adminNotes = body.adminNotes ?? null;
    }

    if (Object.keys(data).length === 0) {
      return bad("Nothing to update");
    }

    const existing = await prisma.supportRequest.findUnique({
      where: { id: params.id },
    });
    if (!existing) return bad("Support request not found", 404);

    const updated = await prisma.supportRequest.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ ok: true, request: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/admin/support/[id]");
  }
}
