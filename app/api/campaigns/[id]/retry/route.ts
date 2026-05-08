// Resets all "failed" contacts in a campaign back to "pending" so the existing
// SSE send route picks them up on the next stream.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    assertOwnership(campaign, userId);

    const result = await prisma.contact.updateMany({
      where: { campaignId: params.id, status: "failed" },
      data: { status: "pending", errorMessage: null, sentAt: null },
    });

    if (result.count > 0) {
      await prisma.campaign.update({
        where: { id: params.id },
        data: {
          status: "draft",
          completedAt: null,
          failedCount: { decrement: result.count },
        },
      });
    }

    return NextResponse.json({ ok: true, retried: result.count });
  } catch (err) {
    return handleApiError(err, "PUT /api/campaigns/[id]/retry");
  }
}
