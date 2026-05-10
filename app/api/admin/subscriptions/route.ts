// Subscription roster — every paying user with a Stripe subscription, plus
// derived MRR per plan. Numbers come from local DB (mirrored by the Stripe
// webhook), not Stripe directly, so we don't burn API quota on every load.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { PLANS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const filter = url.searchParams.get("status") ?? ""; // active|past_due|canceled|trialing

    const where = {
      ...(filter ? { stripeSubscriptionStatus: filter } : { NOT: { stripeSubscriptionId: null } }),
    };

    const subs = await prisma.user.findMany({
      where,
      orderBy: { currentPeriodEnd: "asc" },
      select: {
        id: true,
        email: true,
        plan: true,
        stripeSubscriptionStatus: true,
        stripePriceId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        messagesUsedThisMonth: true,
      },
    });

    // MRR breakdown — only ACTIVE subs count toward live MRR.
    const mrrByPlan: Record<string, number> = { free: 0, starter: 0, growth: 0 };
    let activeCount = 0;
    for (const s of subs) {
      if (s.stripeSubscriptionStatus !== "active") continue;
      activeCount++;
      const price = PLANS[s.plan as keyof typeof PLANS]?.price ?? 0;
      mrrByPlan[s.plan] = (mrrByPlan[s.plan] ?? 0) + price;
    }
    const mrrTotal = Object.values(mrrByPlan).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      ok: true,
      subscriptions: subs,
      summary: {
        activeCount,
        mrrTotal,
        mrrByPlan,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/subscriptions");
  }
}
