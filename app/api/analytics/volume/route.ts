// Send volume over time — counts of messages sent per day in the window.
// Used for the line chart in section 3.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { parseRange, emptyDailySeries, ymd } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);

    // Pull sentAt timestamps in the window. Bucketing in JS keeps the SQL
    // portable across Postgres versions.
    const contacts = await prisma.contact.findMany({
      where: {
        campaign: { userId },
        sentAt: { gte: window.start, lte: window.end },
        status: { in: ["sent", "delivered", "read"] },
      },
      select: { sentAt: true },
    });

    const series = emptyDailySeries(window);
    for (const c of contacts) {
      if (!c.sentAt) continue;
      const k = ymd(c.sentAt);
      if (series.has(k)) series.set(k, (series.get(k) ?? 0) + 1);
    }

    const points = Array.from(series, ([date, value]) => ({ date, value }));
    return NextResponse.json({ ok: true, points });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/volume");
  }
}
