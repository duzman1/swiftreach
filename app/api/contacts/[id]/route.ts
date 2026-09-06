// Per-contact PUT (edit) and DELETE. Update accepts partial fields:
//   - data            -> replaces the JSON blob
//   - groupIds        -> replaces group membership
//   - optedOut        -> toggles suppression. Setting to true stamps
//                        optedOutAt; setting to false clears it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { hasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

interface UpdateBody {
  data?: Record<string, string>;
  groupIds?: string[];
  optedOut?: boolean;
  // Pro-only per-client label. Sending null clears it; sending
  // a client id assigns to that client (must belong to caller).
  // Undefined leaves the value untouched.
  clientId?: string | null;
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
    if (body.clientId !== undefined) {
      // Clearing (null) is always allowed — a user who lost Pro
      // must still be able to unassign a stale label. Assigning
      // requires Pro AND ownership of the target client.
      if (body.clientId === null) {
        data.clientId = null;
      } else {
        const owner = await prisma.user.findUnique({
          where: { id: userId },
          select: { plan: true },
        });
        if (!hasFeature(owner?.plan, "perClientReporting")) {
          return NextResponse.json(
            {
              ok: false,
              error: "Per-client reporting requires the Pro plan.",
              upgradeRequired: true,
              requiredPlan: "pro",
            },
            { status: 403 }
          );
        }
        const client = await prisma.client.findUnique({ where: { id: body.clientId } });
        if (!client || client.userId !== userId) return bad("Client not found", 404);
        if (client.archived) {
          return bad("Cannot assign an archived client. Unarchive it first.", 400);
        }
        data.clientId = body.clientId;
      }
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
