// All campaigns across all users — for /admin/campaigns. Joined with the
// owning user's email so admins can spot misuse patterns at a glance.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const where: Prisma.CampaignWhereInput = {};
    if (status) where.status = status;

    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          mode: true,
          status: true,
          totalCount: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          completedAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      campaigns,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/campaigns");
  }
}
