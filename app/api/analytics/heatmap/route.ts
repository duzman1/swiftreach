// "Best time to send" heatmap. Returns a 7x24 grid of read-rates (reads
// per send) for messages this user sent. Read timestamps come from the
// Meta webhook so this is real engagement data, not a guess.
//
// Cell value: pct of messages sent at that (weekday, hour) bucket that
// were also marked read. Cells with zero sends return null so the UI
// can show "no data" instead of "0% read".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { parseRange, pct } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const gate = await requireFeature(userId, "fullAnalytics");
    if (gate) return gate;

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);

    const contacts = await prisma.contact.findMany({
      where: {
        campaign: { userId },
        sentAt: { gte: window.start, lte: window.end },
        status: { in: ["sent", "delivered", "read"] },
      },
      select: { sentAt: true, readAt: true },
    });

    // 7 rows (Sun..Sat) × 24 cols (0..23). Accumulate sent + read per cell.
    const sent: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0)
    );
    const read: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0)
    );

    for (const c of contacts) {
      if (!c.sentAt) continue;
      const d = c.sentAt;
      const dow = d.getUTCDay(); // 0..6
      const hr = d.getUTCHours(); // 0..23
      sent[dow][hr]++;
      if (c.readAt) read[dow][hr]++;
    }

    const grid = sent.map((row, dow) =>
      row.map((count, hr) =>
        count === 0
          ? { sent: 0, read: 0, rate: null as number | null }
          : { sent: count, read: read[dow][hr], rate: pct(read[dow][hr], count) }
      )
    );

    // Find the strongest bucket for the "your messages get read most on…" copy.
    let best: { dow: number; hr: number; rate: number; sent: number } | null = null;
    for (let dow = 0; dow < 7; dow++) {
      for (let hr = 0; hr < 24; hr++) {
        const cell = grid[dow][hr];
        if (cell.rate == null || cell.sent < 3) continue; // need a meaningful sample
        if (!best || cell.rate > best.rate) {
          best = { dow, hr, rate: cell.rate, sent: cell.sent };
        }
      }
    }

    return NextResponse.json({ ok: true, grid, best });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/heatmap");
  }
}
