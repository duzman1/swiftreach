// Toggle user suspension. Suspended users get a 403 + "contact support" copy
// from /api/campaigns/[id]/send and /api/templates POST. Their existing data
// stays intact — suspension is reversible; deletion is not.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();

    let body: { suspended?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const suspended = Boolean(body.suspended);

    if (params.id === admin.userId && suspended) {
      return NextResponse.json(
        { ok: false, error: "Cannot suspend your own admin account." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { suspended },
      select: { id: true, suspended: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/suspend");
  }
}
