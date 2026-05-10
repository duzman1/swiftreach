// Cross-user campaign list. Server-rendered for the first page, no
// client-side filtering — admins rarely need to drill in here, and when
// they do the user detail page has the user's own campaign tab.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export default async function AdminCampaignsPage() {
  await requireAdmin();

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [campaigns, total, last30, totals] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        mode: true,
        status: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { createdAt: { gte: since30 } } }),
    prisma.campaign.aggregate({
      _sum: { sentCount: true, failedCount: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
        <p className="text-sm text-slate-500 mt-1">
          {total.toLocaleString()} total · {last30.toLocaleString()} in last 30 days · {formatNumber(totals._sum.sentCount ?? 0)} messages sent all-time
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Campaign</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Sent / Total</th>
                <th className="px-4 py-3 text-right">Failed</th>
                <th className="px-4 py-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No campaigns yet
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      {c.user ? (
                        <Link
                          href={`/admin/users/${c.user.id}`}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          {c.user.email}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.mode}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          STATUS_BADGE[c.status] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.sentCount.toLocaleString()} / {c.totalCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.failedCount > 0 ? (
                        <span className="text-red-600">{c.failedCount.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
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
