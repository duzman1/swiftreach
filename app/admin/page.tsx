// Admin overview. Server-rendered — pulls all stats directly from Prisma so
// the page renders without a client fetch waterfall.
//
// Charts render in a small client island (OverviewCharts) so we don't ship
// recharts to the user app.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { PLANS } from "@/lib/stripe";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/admin/StatCard";
import { GrowthLineChart, PlanDonutChart } from "@/components/admin/OverviewCharts";
import {
  Users,
  CreditCard,
  TrendingUp,
  Send,
  AlertCircle,
  ShieldOff,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface DayPoint {
  date: string;
  value: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySeries(days: number): Map<string, number> {
  const map = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    map.set(ymd(d), 0);
  }
  return map;
}

export default async function AdminOverviewPage() {
  await requireAdmin();

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeSubscribers,
    newUsers30d,
    newUsers7d,
    pastDue,
    suspendedCount,
    planCounts,
    campaigns30d,
    campaignAggregate,
    recentSignups,
    pastDueUsers,
    recentUsersForGrowth,
    recentCampaignsForGrowth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { stripeSubscriptionStatus: "active" } }),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { stripeSubscriptionStatus: "past_due" } }),
    prisma.user.count({ where: { suspended: true } }),
    prisma.user.groupBy({ by: ["plan"], _count: { plan: true } }),
    prisma.campaign.count({ where: { createdAt: { gte: since30 } } }),
    prisma.campaign.aggregate({
      where: { createdAt: { gte: since30 } },
      _sum: { sentCount: true, failedCount: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, plan: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { stripeSubscriptionStatus: "past_due" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, email: true, plan: true, currentPeriodEnd: true },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: since30 } },
      select: { createdAt: true },
    }),
    prisma.campaign.findMany({
      where: { createdAt: { gte: since30 } },
      select: { createdAt: true, sentCount: true },
    }),
  ]);

  // ── Plan breakdown + MRR ───────────────────────────────────────────────
  const planBreakdown: Record<string, number> = { free: 0, starter: 0, growth: 0 };
  for (const row of planCounts) planBreakdown[row.plan] = row._count.plan;
  let mrr = 0;
  for (const planId of Object.keys(planBreakdown) as Array<keyof typeof PLANS>) {
    mrr += planBreakdown[planId] * PLANS[planId].price;
  }

  // ── 30-day series ──────────────────────────────────────────────────────
  const signupsMap = emptySeries(30);
  const messagesMap = emptySeries(30);
  for (const u of recentUsersForGrowth) {
    const k = ymd(u.createdAt);
    if (signupsMap.has(k)) signupsMap.set(k, (signupsMap.get(k) ?? 0) + 1);
  }
  for (const c of recentCampaignsForGrowth) {
    const k = ymd(c.createdAt);
    if (messagesMap.has(k)) {
      messagesMap.set(k, (messagesMap.get(k) ?? 0) + c.sentCount);
    }
  }
  const signupsSeries: DayPoint[] = Array.from(signupsMap, ([date, value]) => ({ date, value }));
  const messagesSeries: DayPoint[] = Array.from(messagesMap, ([date, value]) => ({ date, value }));

  const planSlices = [
    { name: "Free", value: planBreakdown.free },
    { name: "Starter", value: planBreakdown.starter },
    { name: "Growth", value: planBreakdown.growth },
  ];

  const messagesSent30d = campaignAggregate._sum.sentCount ?? 0;
  const messagesFailed30d = campaignAggregate._sum.failedCount ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Platform health at a glance — users, revenue, and message volume across the last 30 days.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total users"
          value={formatNumber(totalUsers)}
          delta={`+${newUsers7d} in last 7 days`}
          icon={Users}
        />
        <StatCard
          label="Active subscribers"
          value={formatNumber(activeSubscribers)}
          delta={`${formatNumber(planBreakdown.starter)} starter · ${formatNumber(planBreakdown.growth)} growth`}
          icon={CreditCard}
        />
        <StatCard
          label="MRR (estimated)"
          value={`$${formatNumber(mrr)}`}
          delta="From local plan counts"
          icon={TrendingUp}
        />
        <StatCard
          label="Campaigns (30d)"
          value={formatNumber(campaigns30d)}
          delta={`${formatNumber(messagesSent30d)} messages sent`}
          icon={Send}
        />
        <StatCard
          label="Past due"
          value={formatNumber(pastDue)}
          delta={pastDue === 0 ? "All clear" : "Needs attention"}
          tone={pastDue > 0 ? "warning" : "default"}
          icon={AlertCircle}
        />
        <StatCard
          label="Suspended"
          value={formatNumber(suspendedCount)}
          delta={`${formatNumber(messagesFailed30d)} failed sends (30d)`}
          tone={suspendedCount > 0 ? "warning" : "default"}
          icon={ShieldOff}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-900">Signups (30 days)</div>
            <div className="text-xs text-slate-500">{newUsers30d} total</div>
          </div>
          <GrowthLineChart data={signupsSeries} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-900">Messages sent (30 days)</div>
            <div className="text-xs text-slate-500">{formatNumber(messagesSent30d)} total</div>
          </div>
          <GrowthLineChart data={messagesSeries} color="#10b981" />
        </div>
      </div>

      {/* Donut + recent tables */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">Plan distribution</div>
          <PlanDonutChart data={planSlices} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <div className="mb-3 text-sm font-semibold text-slate-900">Recent signups</div>
          {recentSignups.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">No signups yet</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentSignups.map((u) => (
                <li key={u.id} className="py-2 flex items-center justify-between text-sm">
                  <a
                    href={`/admin/users/${u.id}`}
                    className="text-indigo-600 hover:underline truncate"
                  >
                    {u.email}
                  </a>
                  <span className="text-xs text-slate-500 ml-2 shrink-0">
                    {u.plan} · {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">Failed payments</div>
          {pastDueUsers.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">All payments current</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pastDueUsers.map((u) => (
                <li key={u.id} className="py-2 flex items-center justify-between text-sm">
                  <a
                    href={`/admin/users/${u.id}`}
                    className="text-indigo-600 hover:underline truncate"
                  >
                    {u.email}
                  </a>
                  <span className="text-xs text-amber-600 ml-2 shrink-0">
                    {u.plan}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
