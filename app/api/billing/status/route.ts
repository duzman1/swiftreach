// Returns the current user's plan, subscription status, and message usage.
// Powers the /billing page header AND the dashboard usage meter.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getPlan, getPlanLimits } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const plan = getPlan(user.plan);
    const limits = getPlanLimits(user.plan);
    const used = user.messagesUsedThisMonth;

    // Avoid divide-by-zero for hypothetical 0-message plans.
    const percentUsed =
      limits.messagesPerMonth > 0 && Number.isFinite(limits.messagesPerMonth)
        ? Math.min(100, Math.round((used / limits.messagesPerMonth) * 100))
        : 0;

    return NextResponse.json({
      ok: true,
      plan: plan.id,
      planName: plan.name,
      planPrice: plan.price,
      status: user.stripeSubscriptionStatus,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      hasBillingAccount: Boolean(user.stripeCustomerId),
      usage: {
        messagesUsed: used,
        messagesLimit: limits.messagesPerMonth,
        messagesRemaining: Math.max(0, limits.messagesPerMonth - used),
        percentUsed,
      },
      limits,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/billing/status");
  }
}
