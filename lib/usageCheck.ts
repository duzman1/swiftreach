// Plan-limit enforcement helpers. Called from API routes BEFORE side-effects
// (sending a message, creating a template, exporting CSV, etc.). Limits live
// in lib/stripe.ts PLANS; this file just consults them.
//
// USAGE PERIOD RESET:
//   messagesUsedThisMonth is NOT reset by Stripe events. It resets on
//   the 1st of every calendar month at 00:00 UTC for every account,
//   regardless of plan, billing interval, or signup date.
//
//   The reset itself is lazy — rollUsagePeriodIfExpired() below runs
//   at the top of every limit check AND every increment, so the
//   counter is always current the moment anyone looks at it.
//   Multi-month dormancy (e.g. account inactive since June, viewed
//   in September) collapses to a single UPDATE — no per-month loop.

import { prisma } from "./prisma";
import { getPlanLimits, type PlanLimits } from "./stripe";
import {
  firstOfMonthUtc,
  isUsagePeriodExpired,
} from "./usagePeriod";

// Plans that grant full send access. Access is decided by the `plan`
// field on the user record ONLY — never by stripeSubscriptionStatus.
// Comped accounts, beta users, and admin overrides that set
// plan="pro" manually with no active Stripe subscription must still
// get full pro access. See lib/plans.ts for the CRITICAL BEHAVIOUR
// comment. This is the enforcement point for that invariant.
const PAID_PLANS = ["starter", "growth", "pro"] as const;

export interface AllowedResult {
  allowed: true;
  limit: number;
  used: number;
  remaining: number;
}

export interface BlockedResult {
  allowed: false;
  reason: string;
  /** Set when blocked because plan upgrade would unlock the action. */
  upgradeRequired?: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
}

export type LimitCheckResult = AllowedResult | BlockedResult;

/**
 * Reset the message counter if the user's usage period is from an
 * earlier calendar month (UTC). Idempotent — a no-op mid-month.
 *
 * A single UPDATE handles any gap. Whether the account was dormant
 * for a day or for a year, one call snaps usagePeriodStart to the
 * first-of-this-month and zeroes the counter.
 *
 * Called at the top of every limit check, every send-increment, and
 * by the dashboard/billing pages before they display the counter —
 * so no surface can show a stale "451 / 500" from a prior month.
 *
 * Returns the fresh values the caller should use.
 */
export async function ensureUsagePeriodCurrent(
  userId: string
): Promise<{ used: number; periodStart: Date } | null> {
  return rollUsagePeriodIfExpired(userId);
}

async function rollUsagePeriodIfExpired(
  userId: string
): Promise<{ used: number; periodStart: Date } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { messagesUsedThisMonth: true, usagePeriodStart: true },
  });
  if (!user) return null;

  const now = new Date();
  const currentStart = new Date(user.usagePeriodStart);

  if (!isUsagePeriodExpired(currentStart, now)) {
    return { used: user.messagesUsedThisMonth, periodStart: currentStart };
  }

  // Snap to the 00:00-UTC start of the current calendar month. This
  // is the single source of truth for "which period are we in" —
  // never Stripe's billing anniversary.
  const rolledStart = firstOfMonthUtc(now);
  await prisma.user.update({
    where: { id: userId },
    data: {
      messagesUsedThisMonth: 0,
      usagePeriodStart: rolledStart,
    },
  });

  return { used: 0, periodStart: rolledStart };
}

/**
 * Can the user send `count` more messages this period?
 * Also gates on subscription status — past-due paid users can't send.
 */
export async function checkMessageLimit(
  userId: string,
  count = 1
): Promise<LimitCheckResult> {
  // Roll the usage period first so a stale counter never blocks a
  // send. This is the ONLY reset mechanism for messagesUsedThisMonth.
  await rollUsagePeriodIfExpired(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      messagesUsedThisMonth: true,
    },
  });

  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  // Access is decided by the plan field ONLY. Never by
  // stripeSubscriptionStatus. See lib/plans.ts's CRITICAL BEHAVIOUR
  // comment. A user with plan="pro" (or any paid tier) set manually
  // in the DB — comped account, beta user, admin override — with
  // NO Stripe subscription at all must still get full paid access.
  //
  // The webhook is the source of truth for downgrades: when a Stripe
  // subscription ends or a card gives up, the webhook flips plan
  // back to "free" and this gate fires correctly.
  const isPaidPlan = (PAID_PLANS as readonly string[]).includes(user.plan);
  if (!isPaidPlan) {
    return {
      allowed: false,
      reason:
        "This feature requires a paid plan. Upgrade at swiftreach.app/billing",
      upgradeRequired: true,
    };
  }

  const limits: PlanLimits = getPlanLimits(user.plan);
  const used = user.messagesUsedThisMonth;
  const limit = limits.messagesPerMonth;

  if (used + count > limit) {
    return {
      allowed: false,
      reason: `You have used ${used} of ${limit} messages this month. Upgrade your plan to send more.`,
      upgradeRequired: true,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  return { allowed: true, limit, used, remaining: limit - used };
}

/** Can the user create one more saved template? */
export async function checkTemplateLimit(
  userId: string
): Promise<LimitCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) return { allowed: false, reason: "User not found" };

  const limits = getPlanLimits(user.plan);
  if (limits.templates === Infinity) {
    return { allowed: true, limit: Infinity, used: 0, remaining: Infinity };
  }

  const used = await prisma.messageTemplate.count({ where: { userId } });
  if (used >= limits.templates) {
    return {
      allowed: false,
      reason: `Your ${user.plan} plan allows up to ${limits.templates} templates. Upgrade to save unlimited templates.`,
      upgradeRequired: true,
      limit: limits.templates,
      used,
      remaining: 0,
    };
  }
  return { allowed: true, limit: limits.templates, used, remaining: limits.templates - used };
}

/** Is CSV export allowed on this user's plan? */
export async function checkCsvExportAllowed(
  userId: string
): Promise<LimitCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) return { allowed: false, reason: "User not found" };

  const limits = getPlanLimits(user.plan);
  if (!limits.csvExport) {
    return {
      allowed: false,
      reason: "CSV export is available on Starter and Growth plans. Upgrade to export campaign results.",
      upgradeRequired: true,
    };
  }
  return { allowed: true, limit: 1, used: 0, remaining: 1 };
}

/**
 * Increment the message counter — call after each successful send.
 * Also rolls the period first so an increment can never land against
 * a stale month.
 */
export async function incrementMessageUsage(
  userId: string,
  count = 1
): Promise<void> {
  await rollUsagePeriodIfExpired(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { messagesUsedThisMonth: { increment: count } },
  });
}

/**
 * Reset the monthly counter — admin override only.
 *
 * NOT called by any Stripe webhook. Usage periods are calendar-month
 * based (see rollUsagePeriodIfExpired above); this helper is kept
 * exported for admin "reset now" actions. Snaps usagePeriodStart to
 * the start of the current calendar month so the next auto-roll
 * lines up naturally.
 */
export async function resetMonthlyUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      messagesUsedThisMonth: 0,
      usagePeriodStart: firstOfMonthUtc(new Date()),
    },
  });
}
