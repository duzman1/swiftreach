// Campaign performance table — every campaign in the range ranked by
// read rate. Joins the live status counts so the row data matches what
// the /campaigns detail page shows.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { parseRange, pct, campaignClientFilter } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);
    const clientFilter = campaignClientFilter(url.searchParams);
    const hasClientFilter = Object.keys(clientFilter).length > 0;

    // When a client filter is active, also count the same period
    // unfiltered so the empty-state UI can distinguish "no sends
    // in this period" from "sends exist but none for this client".
    const unfilteredInPeriod = hasClientFilter
      ? await prisma.campaign.count({
          where: {
            userId,
            createdAt: { gte: window.start, lte: window.end },
          },
        })
      : null;

    const campaigns = await prisma.campaign.findMany({
      where: {
        userId,
        ...clientFilter,
        createdAt: { gte: window.start, lte: window.end },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        mode: true,
        status: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        contacts: { select: { status: true } },
      },
    });

    const rows = campaigns.map((c) => {
      let sent = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;
      for (const ct of c.contacts) {
        if (ct.status === "sent") sent++;
        else if (ct.status === "delivered") {
          sent++;
          delivered++;
        } else if (ct.status === "read") {
          sent++;
          delivered++;
          read++;
        } else if (ct.status === "failed") {
          failed++;
        }
      }
      return {
        id: c.id,
        name: c.name,
        mode: c.mode,
        status: c.status,
        createdAt: c.createdAt,
        sent,
        delivered,
        read,
        failed,
        readRate: pct(read, sent),
        deliveryRate: pct(delivered, sent),
      };
    });

    rows.sort((a, b) => b.readRate - a.readRate);

    return NextResponse.json({
      ok: true,
      campaigns: rows,
      unfilteredInPeriod, // number when a client filter is active; null otherwise
    });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/campaigns");
  }
}
