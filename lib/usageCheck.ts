// Plan-limit enforcement helpers. Called from API routes BEFORE side-effects
// (sending a message, creating a template, exporting CSV, etc.). Limits live
// in lib/stripe.ts PLANS; this file just consults them.

import { prisma } from "./prisma";
import { getPlanLimits, type PlanLimits } from "./stripe";

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
      stripeSubscriptionStatus: true,
    },
  });

  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  // Paid plans require an active subscription. "trialing" counts as active
  // — Stripe considers it healthy. "past_due" / "canceled" / "unpaid" don't.
  if (
    user.plan !== "free" &&
    user.stripeSubscriptionStatus !== "active" &&
    user.stripeSubscriptionStatus !== "trialing"
  ) {
    return {
      allowed: false,
      reason:
        "Your subscription is not active. Please update your billing to keep sending.",
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
