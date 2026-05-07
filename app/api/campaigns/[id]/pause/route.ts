import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: "paused" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "PUT /api/campaigns/[id]/pause");
  }
}
