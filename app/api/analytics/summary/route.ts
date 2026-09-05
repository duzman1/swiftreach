// Summary cards + funnel data. Counts every Contact row owned by this
// user (via their campaigns) within the date range, broken down by
// final status.
//
// Status values come from the send loop + webhook handler:
//   sent      — message accepted by Meta
//   delivered — Meta confirmed delivery to handset (still counts as sent)
//   read      — recipient opened it
//   failed    — Meta rejected or timed out
//   skipped   — pre-send suppression (opted out, invalid phone, etc.)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { parseRange, pct } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const url = new URL(req.url);
    const window = parseRange(url.searchParams);

    // We count by Contact rows joined to user's campaigns, scoped to the
    // moment the campaign was created. (sentAt is null for failed sends
    // pre-Meta; campaign.createdAt is the most stable anchor.)
    const grouped = await prisma.contact.groupBy({
      by: ["status"],
      where: {
        campaign: {
          userId,
          createdAt: { gte: window.start, lte: window.end },
        },
      },
      _count: { status: true },
    });

    const totals: Record<string, number> = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      sending: 0,
      invalid: 0,
      limit_reached: 0,
    };
    for (const row of grouped) {
      totals[row.status] = row._count.status;
    }

    // `sent` covers anything that left this app (sent, delivered, read).
    // The funnel asks "out of N sent, how many reached delivered/read?"
    const sentTotal = totals.sent + totals.delivered + totals.read;
    const deliveredTotal = totals.delivered + totals.read;
    const readTotal = totals.read;
    const failedTotal = totals.failed;

    return NextResponse.json({
      ok: true,
      range: { start: window.start, end: window.end, days: window.days },
      counts: {
        sent: sentTotal,
        delivered: deliveredTotal,
        read: readTotal,
        failed: failedTotal,
        skipped: totals.skipped,
      },
      rates: {
        delivered: pct(deliveredTotal, sentTotal),
        read: pct(readTotal, sentTotal),
        failed: pct(failedTotal, sentTotal + failedTotal),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/summary");
  }
}
