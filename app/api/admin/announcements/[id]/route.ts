// Update / delete a single announcement. Same transactional rule as POST:
// if you set `active: true`, every other row gets deactivated first.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["info", "warning", "success"] as const;
const VALID_TARGETS = ["all", "free", "paid"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    let body: {
      message?: string;
      type?: string;
      target?: string;
      active?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.message === "string") {
      const m = body.message.trim();
      if (!m) return NextResponse.json({ ok: false, error: "Message can't be empty" }, { status: 400 });
      data.message = m;
    }
    if (body.type && (VALID_TYPES as readonly string[]).includes(body.type)) {
      data.type = body.type;
    }
    if (body.target && (VALID_TARGETS as readonly string[]).includes(body.target)) {
      data.target = body.target;
    }
    if (typeof body.active === "boolean") {
      data.active = body.active;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.active === true) {
        await tx.announcement.updateMany({
          where: { active: true, NOT: { id: params.id } },
          data: { active: false },
        });
      }
      return tx.announcement.update({
        where: { id: params.id },
        data,
      });
    });

    return NextResponse.json({ ok: true, announcement: updated });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/announcements/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    await prisma.announcement.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/announcements/[id]");
  }
}
