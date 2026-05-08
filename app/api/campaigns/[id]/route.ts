import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

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
