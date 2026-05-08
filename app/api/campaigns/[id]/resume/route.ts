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
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: "sending" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "PUT /api/campaigns/[id]/resume");
  }
}
