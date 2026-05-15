// Per-plan daily webhook rate limiter for the public API.
//
// "Daily" = a 24-hour rolling window from now. Counts every WebhookLog
// entry for the user EXCEPT entries with status="rate_limited" (those
// are limit-rejection records, counting them would compound the limit).
//
// Limits are read from env at first call and cached for the process
// lifetime. Without env overrides the defaults match the spec.

import { prisma } from "./prisma";

interface PlanLimits {
  free: number;
  starter: number;
  growth: number;
  pro: number;
  [key: string]: number;
}

let cached: PlanLimits | null = null;

function readLimits(): PlanLimits {
  if (cached) return cached;
  const num = (key: string, fallback: number) => {
    const raw = process.env[key];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  cached = {
    free: num("WEBHOOK_RATE_LIMIT_MAX_FREE", 0),
    starter: num("WEBHOOK_RATE_LIMIT_MAX_STARTER", 100),
    growth: num("WEBHOOK_RATE_LIMIT_MAX_GROWTH", 1000),
    pro: num("WEBHOOK_RATE_LIMIT_MAX_PRO", 10000),
  };
  return cached;
}

const WINDOW_MS = (() => {
  const raw = process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
  const fallback = 24 * 60 * 60 * 1000;
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
})();

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: Date;
}

export function dailyLimitForPlan(plan: string): number {
  const limits = readLimits();
  return limits[plan] ?? 0;
}

export async function checkWebhookRateLimit(
  userId: string,
  plan: string
): Promise<RateLimitState> {
  const limit = dailyLimitForPlan(plan);

  // Free plan (or any plan with limit 0) → reject without hitting the DB.
  if (limit <= 0) {
    return {
      allowed: false,
      limit: 0,
      used: 0,
      remaining: 0,
      resetAt: new Date(Date.now() + WINDOW_MS),
    };
  }

  const since = new Date(Date.now() - WINDOW_MS);
  const used = await prisma.webhookLog.count({
    where: {
      userId,
      createdAt: { gte: since },
      // Never count rejection rows themselves toward the limit.
      status: { not: "rate_limited" },
    },
  });

  return {
    allowed: used < limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: new Date(Date.now() + WINDOW_MS),
  };
}
