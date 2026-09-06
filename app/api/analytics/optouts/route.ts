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

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    // When a client filter is active, restrict opt-outs to those from
    // SavedContacts labelled with that client. OptOutLog isn't
    // client-tagged directly; the join goes phoneNumber → SavedContact.
    let optOutPhones: string[] | null = null;
    if (Object.keys(clientFilter).length > 0) {
      const rows = await prisma.savedContact.findMany({
        where: { userId, ...clientFilter },
        select: { phoneNumber: true },
      });
      optOutPhones = rows.map((r) => r.phoneNumber);
    }
    const optOutBase = optOutPhones
      ? { userId, phoneNumber: { in: optOutPhones } }
      : { userId };

    const [totalOptedOut, thisMonth, inRange, sentInRange] = await Promise.all([
      prisma.savedContact.count({
        where: { userId, ...clientFilter, optedOut: true },
      }),
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
