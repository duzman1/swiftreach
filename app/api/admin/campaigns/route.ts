// All campaigns across ALL users — admins see the full platform here, not
// just their own. No userId filter is applied. Joined with the owning User
// for email + name so admins can spot misuse patterns at a glance.
//
// `summary` returns all-time aggregates + a 30d count so the page header
// can show "X total · Y in last 30 days · Z messages sent" without making
// the client run extra queries.

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

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, campaigns, totalAllTime, last30, sumAggregate] = await Promise.all([
      // `total` reflects the active filter (e.g. status), used for pagination.
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
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      // Summary numbers ignore the active filter so the header always shows
      // the platform-wide truth.
      prisma.campaign.count(),
      prisma.campaign.count({ where: { createdAt: { gte: since30 } } }),
      prisma.campaign.aggregate({
        _sum: { sentCount: true, failedCount: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      campaigns,
      summary: {
        totalAllTime,
        last30,
        messagesSentAllTime: sumAggregate._sum.sentCount ?? 0,
        messagesFailedAllTime: sumAggregate._sum.failedCount ?? 0,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/campaigns");
  }
}
