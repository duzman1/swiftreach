// Opt-out tracking — total opted out, this month, and a daily series for
// the trend chart. Rate is opt-outs / total messages sent in the window.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { parseRange, emptyDailySeries, ymd, pct, campaignClientFilter } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const gate = await requireFeature(userId, "fullAnalytics");
    if (gate) return gate;

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);
    const clientFilter = campaignClientFilter(url.searchParams);
    const hasClientFilter = Object.keys(clientFilter).length > 0;

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    // Client-scoped opt-out queries now go through OptOutLog.campaignId
    // → Campaign.clientId — the same single scoping rule the rest of
    // the report uses. See lib/report/reportData.ts's header comment.
    // Rows with OptOutLog.campaignId = null are unattributable and
    // are excluded from every client-filtered count; they still show
    // in the unfiltered view.
    const optOutBase = hasClientFilter
      ? { userId, campaign: { is: { userId, ...clientFilter } } }
      : { userId };

    // totalOptedOut for a client filter = distinct phones with any
    // attributable opt-out on a matching campaign. Without a filter
    // we keep the SavedContact-side count for backwards compat with
    // the existing dashboard tile ("total contacts who ever opted out").
    const totalOptedOutQuery = hasClientFilter
      ? prisma.optOutLog
          .findMany({
            where: optOutBase,
            select: { phoneNumber: true },
            distinct: ["phoneNumber"],
          })
          .then((rows) => rows.length)
      : prisma.savedContact.count({ where: { userId, optedOut: true } });

    const [totalOptedOut, thisMonth, inRange, sentInRange] = await Promise.all([
      totalOptedOutQuery,
      prisma.optOutLog.count({
        where: { ...optOutBase, createdAt: { gte: startOfMonth } },
      }),
      prisma.optOutLog.findMany({
        where: { ...optOutBase, createdAt: { gte: window.start, lte: window.end } },
        select: { createdAt: true },
      }),
      prisma.contact.count({
        where: {
          campaign: { userId, ...clientFilter },
          sentAt: { gte: window.start, lte: window.end },
          status: { in: ["sent", "delivered", "read"] },
        },
      }),
    ]);

    const series = emptyDailySeries(window);
    for (const o of inRange) {
      const k = ymd(o.createdAt);
      if (series.has(k)) series.set(k, (series.get(k) ?? 0) + 1);
    }
    const points = Array.from(series, ([date, value]) => ({ date, value }));

    return NextResponse.json({
      ok: true,
      totalOptedOut,
      thisMonth,
      inRange: inRange.length,
      ratePct: pct(inRange.length, sentInRange),
      points,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/optouts");
  }
}
