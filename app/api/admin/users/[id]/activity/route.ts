// Activity feed for a single user — recent campaigns + recent error logs.
// Powers the Campaigns + Activity Log tabs on /admin/users/[id].

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const [campaigns, errors] = await Promise.all([
      prisma.campaign.findMany({
        where: { userId: params.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          status: true,
          mode: true,
          totalCount: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.errorLog.findMany({
        where: { userId: params.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          route: true,
          message: true,
          severity: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, campaigns, errors });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/[id]/activity");
  }
}
