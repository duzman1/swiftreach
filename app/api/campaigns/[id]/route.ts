import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        contacts: {
          orderBy: { id: "asc" },
        },
      },
    });
    if (!campaign) {
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
    // Block deletion of an in-flight send so we don't leave the SSE loop
    // querying a deleted campaign id.
    const existing = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (existing.status === "sending") {
      return NextResponse.json(
        {
          ok: false,
          error: "Cancel the campaign before deleting it.",
        },
        { status: 409 }
      );
    }
    // Contact rows cascade automatically via the onDelete: Cascade in schema.
    await prisma.campaign.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "/api/campaigns/[id]");
  }
}
