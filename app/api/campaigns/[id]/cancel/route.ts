import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    assertOwnership(campaign, userId);

    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: params.id },
        data: { status: "cancelled", completedAt: new Date() },
      }),
      prisma.contact.updateMany({
        where: { campaignId: params.id, status: { in: ["pending", "sending"] } },
        data: { status: "cancelled" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "PUT /api/campaigns/[id]/cancel");
  }
}
