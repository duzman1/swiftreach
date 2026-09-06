import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { hasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        contacts: {
          orderBy: { id: "asc" },
        },
      },
    });
    if (!campaign || campaign.userId !== userId) {
      // Same response for "doesn't exist" and "not yours" — don't leak which
      // campaign IDs are valid in the system.
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, campaign });
  } catch (err) {
    return handleApiError(err, "/api/campaigns/[id]");
  }
}

/**
 * PATCH-style PUT for post-creation edits. Currently only the client
 * label is mutable here — the rest of a campaign's shape is frozen
 * once created (recipients baked, message rendered). Body:
 *   { clientId: string | null }
 * Clearing (null) is always allowed; assigning requires Pro AND
 * ownership of a non-archived client.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    assertOwnership(existing, userId);

    let body: { clientId?: string | null };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    if (body.clientId === undefined) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    let clientId: string | null = null;
    if (body.clientId !== null) {
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
      if (!client || client.userId !== userId) {
        return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
      }
      if (client.archived) {
        return NextResponse.json(
          { ok: false, error: "Cannot assign an archived client. Unarchive it first." },
          { status: 400 }
        );
      }
      clientId = client.id;
    }

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: { clientId },
      select: { id: true, clientId: true },
    });
    return NextResponse.json({ ok: true, campaign: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/campaigns/[id]");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { userId: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    assertOwnership(existing, userId);
    if (existing.status === "sending") {
      return NextResponse.json(
        { ok: false, error: "Cancel the campaign before deleting it." },
        { status: 409 }
      );
    }
    await prisma.campaign.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "/api/campaigns/[id]");
  }
}
