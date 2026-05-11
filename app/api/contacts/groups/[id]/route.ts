// Per-group rename / recolor / delete. Deleting a group does NOT delete
// its contacts — it just removes the group membership tag from each.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requirePaidPlan } from "@/lib/planGate";

export const dynamic = "force-dynamic";

interface UpdateBody {
  name?: string;
  description?: string | null;
  color?: string;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function loadOwned(id: string, userId: string) {
  const row = await prisma.contactGroup.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "contact_book");
    if (gate) return gate;
    if (!(await loadOwned(params.id, userId))) return bad("Group not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return bad("Name can't be blank");
      data.name = n;
    }
    if (body.description !== undefined) {
      data.description = body.description?.trim() || null;
    }
    if (typeof body.color === "string") data.color = body.color;

    const updated = await prisma.contactGroup.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ ok: true, group: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/contacts/groups/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "contact_book");
    if (gate) return gate;
    if (!(await loadOwned(params.id, userId))) return bad("Group not found", 404);

    // Strip this group id from every contact that has it. We could be
    // clever with raw SQL but for typical group sizes the JS approach
    // is fast enough and uses Prisma types.
    const tagged = await prisma.savedContact.findMany({
      where: { userId, groupIds: { contains: params.id } },
      select: { id: true, groupIds: true },
    });
    for (const c of tagged) {
      const existing: string[] = JSON.parse(c.groupIds || "[]");
      const next = existing.filter((g) => g !== params.id);
      await prisma.savedContact.update({
        where: { id: c.id },
        data: { groupIds: JSON.stringify(next) },
      });
    }

    await prisma.contactGroup.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/contacts/groups/[id]");
  }
}
