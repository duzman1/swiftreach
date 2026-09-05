// Plan-limit enforcement helpers. Called from API routes BEFORE side-effects
// (sending a message, creating a template, exporting CSV, etc.). Limits live
// in lib/stripe.ts PLANS; this file just consults them.

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
 * Can the user send `count` more messages this period?
 * Also gates on subscription status — past-due paid users can't send.
 */
export async function checkMessageLimit(
  userId: string,
  count = 1
): Promise<LimitCheckResult> {
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
 * Reset the monthly counter. Called by the Stripe webhook on invoice.paid
 * so the user gets their fresh allotment at the start of each billing cycle.
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
