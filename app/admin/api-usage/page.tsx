// Platform-wide webhook API usage. Server-renders the initial snapshot
// from Prisma, then hands off to the <ApiUsageFeed /> client island
// which polls /api/admin/api-usage every 15 seconds for live updates.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/admin/StatCard";
import { ApiUsageFeed } from "@/components/admin/ApiUsageFeed";
import {
  Activity,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Key,
  Calendar,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminApiUsagePage() {
  await requireAdmin();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalRequests,
    requests24h,
    requests7d,
    successCount24h,
    failedCount24h,
    rateLimitedCount24h,
    activeKeyCount,
    totalKeyCount,
  ] = await Promise.all([
    prisma.webhookLog.count(),
    prisma.webhookLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.webhookLog.count({ where: { createdAt: { gte: since7d } } }),
    prisma.webhookLog.count({
      where: { createdAt: { gte: since24h }, status: "success" },
    }),
    prisma.webhookLog.count({
      where: { createdAt: { gte: since24h }, status: "failed" },
    }),
    prisma.webhookLog.count({
      where: { createdAt: { gte: since24h }, status: "rate_limited" },
    }),
    prisma.apiKey.count({ where: { isActive: true } }),
    prisma.apiKey.count(),
  ]);

  const successRate24h =
    requests24h === 0
      ? "—"
      : `${Math.round((successCount24h / requests24h) * 100)}%`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Usage</h1>
        <p className="text-sm text-slate-500 mt-1">
          Platform-wide webhook API traffic. Live feed refreshes every 15s.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Requests (24h)"
          value={formatNumber(requests24h)}
          delta={`${formatNumber(requests7d)} in last 7 days`}
          icon={Activity}
        />
        <StatCard
          label="Success rate (24h)"
          value={successRate24h}
          delta={`${formatNumber(successCount24h)} successful sends`}
          icon={CheckCircle2}
          tone={requests24h > 0 && successCount24h / requests24h >= 0.9 ? "success" : "default"}
        />
        <StatCard
          label="Failed (24h)"
          value={formatNumber(failedCount24h)}
          delta="Meta / validation errors"
          icon={XCircle}
          tone={failedCount24h > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Rate-limited (24h)"
          value={formatNumber(rateLimitedCount24h)}
          delta="429 responses"
          icon={ShieldAlert}
          tone={rateLimitedCount24h > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Active API keys"
          value={formatNumber(activeKeyCount)}
          delta={`${formatNumber(totalKeyCount)} ever created`}
          icon={Key}
        />
        <StatCard
          label="Total requests"
          value={formatNumber(totalRequests)}
          delta="All time"
          icon={Calendar}
        />
      </div>

      <ApiUsageFeed />
    </div>
  );
}
