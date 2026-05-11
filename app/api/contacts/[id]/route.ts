// Per-contact PUT (edit) and DELETE. Update accepts partial fields:
//   - data            -> replaces the JSON blob
//   - groupIds        -> replaces group membership
//   - optedOut        -> toggles suppression. Setting to true stamps
//                        optedOutAt; setting to false clears it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requirePaidPlan } from "@/lib/planGate";

export const dynamic = "force-dynamic";

interface UpdateBody {
  data?: Record<string, string>;
  groupIds?: string[];
  optedOut?: boolean;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function loadOwned(id: string, userId: string) {
  const row = await prisma.savedContact.findUnique({ where: { id } });
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
    const existing = await loadOwned(params.id, userId);
    if (!existing) return bad("Contact not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const data: Record<string, unknown> = {};
    if (body.data !== undefined) data.data = JSON.stringify(body.data);
    if (Array.isArray(body.groupIds)) data.groupIds = JSON.stringify(body.groupIds);
    if (typeof body.optedOut === "boolean") {
      data.optedOut = body.optedOut;
      data.optedOutAt = body.optedOut ? new Date() : null;
    }

    const updated = await prisma.savedContact.update({
      where: { id: params.id },
      data,
    });

    // Bump group counts on group changes.
    if (Array.isArray(body.groupIds)) {
      const oldGroups: string[] = JSON.parse(existing.groupIds || "[]");
      const allGroups = Array.from(new Set([...oldGroups, ...body.groupIds]));
      for (const gid of allGroups) {
        const count = await prisma.savedContact.count({
          where: { userId, groupIds: { contains: gid } },
        });
        await prisma.contactGroup
          .update({ where: { id: gid }, data: { contactCount: count } })
          .catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true, contact: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/contacts/[id]");
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
    const existing = await loadOwned(params.id, userId);
    if (!existing) return bad("Contact not found", 404);

    await prisma.savedContact.delete({ where: { id: params.id } });

    const groups: string[] = JSON.parse(existing.groupIds || "[]");
    for (const gid of groups) {
      const count = await prisma.savedContact.count({
        where: { userId, groupIds: { contains: gid } },
      });
      await prisma.contactGroup
        .update({ where: { id: gid }, data: { contactCount: count } })
        .catch(() => undefined);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/contacts/[id]");
  }
}
