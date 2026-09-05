// Admin overview top-line stats. All counts come straight from the DB —
// no Stripe API hits per request (would be too slow, and we mirror the
// authoritative state onto User rows via webhooks anyway).
//
// Returned shape is intentionally flat — the UI just bind props onto
// stat cards.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { PLANS } from "@/lib/stripe";
import { normalizedMonthlyRevenue, type BillingInterval } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // All counts query across ALL users (no userId filter) — admins see the
    // whole platform. We compute both 30d windows AND all-time totals so the
    // Overview never reads "0" just because activity is older than 30 days.
    const [
      totalUsers,
      activeSubscribers,
      newUsers30d,
      planCounts,
      totalCampaigns,
      campaigns30d,
      messagesAggAllTime,
      messagesAgg30d,
      pastDue,
      suspendedCount,
      messagesUsedAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { stripeSubscriptionStatus: "active" } }),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { createdAt: { gte: since30 } } }),
      prisma.campaign.aggregate({
        _sum: { sentCount: true, failedCount: true },
      }),
      prisma.campaign.aggregate({
        where: { createdAt: { gte: since30 } },
        _sum: { sentCount: true, failedCount: true },
      }),
      prisma.user.count({ where: { stripeSubscriptionStatus: "past_due" } }),
      prisma.user.count({ where: { suspended: true } }),
      prisma.user.aggregate({
        _sum: { messagesUsedThisMonth: true },
      }),
    ]);

    // MRR — sum of normalized monthly revenue per user, accounting for
    // billingInterval (annual plans divided by 12). Stripe is still the
    // source of truth for actual revenue; this is a fast estimate from
    // local plan+interval columns, good enough for a dashboard tile.
    // Pro tier included.
    const planBreakdown: Record<string, number> = {
      free: 0,
      starter: 0,
      growth: 0,
      pro: 0,
    };
    for (const row of planCounts) {
      planBreakdown[row.plan] = row._count.plan;
    }

    // Fetch plan + interval pairs for the MRR sum. Cheap because we
    // only need paid rows.
    const paidUsers = await prisma.user.findMany({
      where: { plan: { in: ["starter", "growth", "pro"] } },
      select: { plan: true, billingInterval: true },
    });
    let mrr = 0;
    for (const u of paidUsers) {
      const interval: BillingInterval =
        u.billingInterval === "year" ? "year" : "month";
      mrr += normalizedMonthlyRevenue(u.plan, interval);
    }
    mrr = Math.round(mrr);

    // Keep the legacy PLANS reference in scope — used for the plan
    // breakdown labels below; no logic depends on it after MRR.
    void PLANS;

    // 7-day signups for the "trend" sparkline.
    const newUsers7d = await prisma.user.count({
      where: { createdAt: { gte: since7 } },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        totalUsers,
        activeSubscribers,
        newUsers30d,
        newUsers7d,
        mrr,
        totalCampaigns,
        campaigns30d,
        messagesSentAllTime: messagesAggAllTime._sum.sentCount ?? 0,
        messagesFailedAllTime: messagesAggAllTime._sum.failedCount ?? 0,
        messagesSent30d: messagesAgg30d._sum.sentCount ?? 0,
        messagesFailed30d: messagesAgg30d._sum.failedCount ?? 0,
        messagesUsedThisMonth: messagesUsedAgg._sum.messagesUsedThisMonth ?? 0,
        pastDue,
        suspended: suspendedCount,
        planBreakdown,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stats");
  }
}
