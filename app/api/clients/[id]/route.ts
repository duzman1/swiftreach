// Per-client PUT (rename / recolor / archive) and DELETE.
//
// DELETE is the "hard" action: removes the Client row. Because
// SavedContact.clientId and Campaign.clientId are SetNull FKs,
// deleting a client clears the label everywhere it was assigned
// but never removes the underlying contacts, campaigns, or their
// message history. Callers should prefer archiving over deletion;
// the UI reserves delete for a confirm dialog that states this.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";

export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface UpdateBody {
  name?: string;
  color?: string | null;
  archived?: boolean;
}

async function loadOwned(id: string, userId: string) {
  const c = await prisma.client.findUnique({ where: { id } });
  if (!c || c.userId !== userId) return null;
  return c;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "perClientReporting");
    if (gate) return gate;

    const existing = await loadOwned(params.id, user.id);
    if (!existing) return errorResponse("Client not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return errorResponse("Name can't be blank", 400);
      if (n.length > MAX_NAME) {
        return errorResponse(`Name must be ${MAX_NAME} characters or fewer`, 400);
      }
      data.name = n;
    }
    if (body.color !== undefined) {
      const c = body.color?.trim() ?? "";
      if (c && !HEX_RE.test(c)) {
        return errorResponse("Color must be a 6-digit hex like #25D366", 400);
      }
      data.color = c || null;
    }
    if (typeof body.archived === "boolean") {
      data.archived = body.archived;
    }
    if (Object.keys(data).length === 0) {
      return errorResponse("No fields to update", 400);
    }

    try {
      const updated = await prisma.client.update({
        where: { id: params.id },
        data,
        include: { _count: { select: { savedContacts: true, campaigns: true } } },
      });
      return NextResponse.json({
        ok: true,
        client: {
          id: updated.id,
          name: updated.name,
          color: updated.color,
          archived: updated.archived,
          createdAt: updated.createdAt,
          contactCount: updated._count.savedContacts,
          campaignCount: updated._count.campaigns,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("A client with that name already exists.", 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err, "PUT /api/clients/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "perClientReporting");
    if (gate) return gate;

    const existing = await loadOwned(params.id, user.id);
    if (!existing) return errorResponse("Client not found", 404);

    // SavedContact.clientId + Campaign.clientId are SetNull FKs, so
    // this DROP clears the label everywhere but leaves every
    // contact, campaign, and message history row untouched.
    await prisma.client.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/clients/[id]");
  }
}
