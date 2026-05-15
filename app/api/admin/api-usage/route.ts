// Platform-wide webhook API usage stats. Admin-only.
//
// We deliberately keep this read-only and DB-driven. Nothing here mutates
// state, so it's safe to refresh at any cadence.
//
// Shape:
//   stats: top-line counters (24h + all-time)
//   topUsers: heaviest API consumers in the last 24h (with plan + email)
//   recentLogs: most recent ~50 WebhookLog rows for the live feed

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
      topUsersGroup,
      recentLogs,
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
      prisma.webhookLog.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: since24h } },
        _count: { userId: true },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
      prisma.webhookLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          apiKey: { select: { name: true, keyPrefix: true } },
        },
      }),
    ]);

    // Hydrate top users with email + plan from User table (no JOIN on
    // groupBy in Prisma — second query is fine for ≤10 rows).
    const topUserIds = topUsersGroup.map((g) => g.userId);
    const topUserRows = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, email: true, plan: true },
        })
      : [];
    const userById = new Map(topUserRows.map((u) => [u.id, u]));
    const topUsers = topUsersGroup.map((g) => ({
      userId: g.userId,
      email: userById.get(g.userId)?.email ?? "(unknown)",
      plan: userById.get(g.userId)?.plan ?? "—",
      requests: g._count.userId,
    }));

    // Hydrate recent logs with user email so the live feed is useful.
    const logUserIds = Array.from(new Set(recentLogs.map((l) => l.userId)));
    const logUserRows = logUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: logUserIds } },
          select: { id: true, email: true },
        })
      : [];
    const logUserById = new Map(logUserRows.map((u) => [u.id, u.email]));

    const logs = recentLogs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      userId: l.userId,
      email: logUserById.get(l.userId) ?? "(unknown)",
      keyName: l.apiKey?.name ?? "—",
      keyPrefix: l.apiKey?.keyPrefix ?? "—",
      phoneNumber: l.phoneNumber,
      messageType: l.messageType,
      templateName: l.templateName ?? null,
      status: l.status,
      errorMessage: l.errorMessage ?? null,
      responseTimeMs: l.responseTimeMs ?? null,
    }));

    return NextResponse.json({
      ok: true,
      stats: {
        totalRequests,
        requests24h,
        requests7d,
        successCount24h,
        failedCount24h,
        rateLimitedCount24h,
        activeKeyCount,
        totalKeyCount,
      },
      topUsers,
      recentLogs: logs,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/api-usage");
  }
}
