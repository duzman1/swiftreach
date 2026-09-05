// GET — recent runs for one automation (last 30). Used by the
//       detail page's run history table.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const auto = await prisma.automation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    assertOwnership(auto, userId, "Automation not found");

    const runs = await prisma.automationRun.findMany({
      where: { automationId: params.id },
      orderBy: { runDate: "desc" },
      take: 30,
    });
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    return handleApiError(err, "GET /api/automations/[id]/runs");
  }
}
