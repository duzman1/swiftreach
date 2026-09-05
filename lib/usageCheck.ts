// Plan-limit enforcement helpers. Called from API routes BEFORE side-effects
// (sending a message, creating a template, exporting CSV, etc.). Limits live
// in lib/stripe.ts PLANS; this file just consults them.
//
// USAGE PERIOD RESET (FIX 4A):
//   messagesUsedThisMonth is NOT reset by Stripe events. It is reset
//   lazily by rollUsagePeriodIfExpired() below on every send attempt.
//   Rationale: Free accounts have no invoices, and annual subscribers
//   only get invoice.paid once per year — a plan-independent monthly
//   cycle is the only correct model.

import { prisma } from "./prisma";
import { getPlanLimits, type PlanLimits } from "./stripe";

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
 * Roll the user's usage period forward by whole months until
 * usagePeriodStart is in the future (i.e. the current period covers
 * now). Zeroes messagesUsedThisMonth if any roll happened. Idempotent
 * — a no-op when the period is still current.
 *
 * Called at the top of every send-limit check so the counter is
 * accurate without any cron or webhook dependency.
 *
 * Returns the fresh {used, periodStart} the caller should use.
 */
async function rollUsagePeriodIfExpired(
  userId: string
): Promise<{ used: number; periodStart: Date } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { messagesUsedThisMonth: true, usagePeriodStart: true },
  });
  if (!user) return null;

  const now = new Date();
  const start = new Date(user.usagePeriodStart);

  // Fast path: still inside the current month-window — nothing to do.
  // "One month" is defined as calendar-month rolls (Jan 15 → Feb 15,
  // Feb 15 → Mar 15, …). Handled by incrementing the month field.
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  if (now < next) {
    return { used: user.messagesUsedThisMonth, periodStart: start };
  }

  // Roll forward. Advance by whole months until the next boundary is
  // in the future, so a very-stale account (e.g. dormant for a year)
  // lands on a current window, not on the first stale boundary.
  const nextPeriodStart = new Date(start);
  while (nextPeriodStart <= now) {
    nextPeriodStart.setUTCMonth(nextPeriodStart.getUTCMonth() + 1);
  }
  // The new period STARTS one month before nextPeriodStart's next roll.
  const rolledStart = new Date(nextPeriodStart);
  rolledStart.setUTCMonth(rolledStart.getUTCMonth() - 1);

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

/** Increment the message counter — call after each successful send. */
export async function incrementMessageUsage(
  userId: string,
  count = 1
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { messagesUsedThisMonth: { increment: count } },
  });
}

/**
 * Reset the monthly counter — admin override only.
 *
 * NO LONGER called by the Stripe webhook. Since FIX 4A the usage
 * period is plan-independent and rolls forward on every send attempt
 * (see rollUsagePeriodIfExpired above). Kept exported because the
 * admin user detail page uses it for manual "reset now" actions.
 */
export async function resetMonthlyUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      messagesUsedThisMonth: 0,
      usagePeriodStart: new Date(),
    },
  });
}
