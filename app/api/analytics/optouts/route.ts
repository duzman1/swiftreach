// Opt-out tracking — total opted out, this month, and a daily series for
// the trend chart. Rate is opt-outs / total messages sent in the window.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requirePaidPlan } from "@/lib/planGate";
import { parseRange, emptyDailySeries, ymd, pct } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "analytics");
    if (gate) return gate;

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [totalOptedOut, thisMonth, inRange, sentInRange] = await Promise.all([
      prisma.savedContact.count({ where: { userId, optedOut: true } }),
      prisma.optOutLog.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      }),
      prisma.optOutLog.findMany({
        where: { userId, createdAt: { gte: window.start, lte: window.end } },
        select: { createdAt: true },
      }),
      prisma.contact.count({
        where: {
          campaign: { userId },
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
