// Subscriptions page — server-rendered list of every paying user, with an
// MRR-by-plan summary. All numbers come from the local DB (mirrored from
// Stripe via webhook); no Stripe API call on render.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { PLANS } from "@/lib/stripe";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/admin/StatCard";
import { MrrBarChart } from "@/components/admin/MrrBarChart";
import { CreditCard, TrendingUp, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-600",
  trialing: "bg-blue-100 text-blue-700",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function AdminSubscriptionsPage() {
  await requireAdmin();

  const subs = await prisma.user.findMany({
    where: { NOT: { stripeSubscriptionId: null } },
    orderBy: { currentPeriodEnd: "asc" },
    select: {
      id: true,
      email: true,
      plan: true,
      stripeSubscriptionStatus: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      messagesUsedThisMonth: true,
    },
  });

  const mrrByPlan: Record<string, number> = { free: 0, starter: 0, growth: 0 };
  let activeCount = 0;
  let pastDueCount = 0;
  for (const s of subs) {
    if (s.stripeSubscriptionStatus === "active") {
      activeCount++;
      const price = PLANS[s.plan as keyof typeof PLANS]?.price ?? 0;
      mrrByPlan[s.plan] = (mrrByPlan[s.plan] ?? 0) + price;
    }
    if (s.stripeSubscriptionStatus === "past_due") pastDueCount++;
  }
  const mrrTotal = Object.values(mrrByPlan).reduce((a, b) => a + b, 0);

  const mrrBars = [
    { name: "Free", value: mrrByPlan.free },
    { name: "Starter", value: mrrByPlan.starter },
    { name: "Growth", value: mrrByPlan.growth },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Subscriptions</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every user with a Stripe subscription. Numbers are from the local DB,
          mirrored by the Stripe webhook.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          label="Active subscribers"
          value={formatNumber(activeCount)}
          icon={CreditCard}
        />
        <StatCard
          label="MRR"
          value={`$${formatNumber(mrrTotal)}`}
          delta="From active subscriptions only"
          icon={TrendingUp}
        />
        <StatCard
          label="Past due"
          value={formatNumber(pastDueCount)}
          delta={pastDueCount === 0 ? "All clear" : "Review payments"}
          tone={pastDueCount > 0 ? "warning" : "default"}
          icon={AlertCircle}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 mb-3">MRR by plan</div>
        <MrrBarChart data={mrrBars} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Usage</th>
                <th className="px-4 py-3 text-right">Renews / ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No subscriptions yet
                  </td>
                </tr>
              ) : (
                subs.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${s.id}`}
                        className="text-indigo-600 hover:underline font-medium"
                      >
                        {s.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.plan}</td>
                    <td className="px-4 py-3">
                      {s.stripeSubscriptionStatus ? (
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                            STATUS_BADGE[s.stripeSubscriptionStatus] ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {s.stripeSubscriptionStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                      {s.cancelAtPeriodEnd && (
                        <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                          cancels at period end
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {s.messagesUsedThisMonth.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {fmtDate(s.currentPeriodEnd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
