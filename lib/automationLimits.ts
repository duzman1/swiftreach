// Plan-tier limits for the automations feature. Extracted so the
// API create route and the /automations list page can both call
// the same check (list page uses it to decide whether to render
// the "Create Automation" CTA or the paywall CTA).
//
// Note: our stripe.ts PLANS only defines free/starter/growth
// today. "pro" is included here as a forward-compat entry — it
// takes effect the moment a Pro tier is added upstream.

import { prisma } from "./prisma";

export const AUTOMATION_LIMITS: Record<string, number> = {
  free: 0,
  starter: 2,
  growth: 10,
  pro: Number.POSITIVE_INFINITY,
};

export interface AutomationCapacity {
  plan: string;
  limit: number;
  usedCount: number;
  remaining: number;
  canCreate: boolean;
}

/** Count how many active/paused automations the user has and
 *  compare against their plan cap. Archived automations don't
 *  count toward the limit. */
export async function getAutomationCapacity(
  userId: string,
  plan: string
): Promise<AutomationCapacity> {
  const limit = AUTOMATION_LIMITS[plan] ?? 0;
  const usedCount = await prisma.automation.count({
    where: { userId, status: { not: "archived" } },
  });
  const remaining =
    limit === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(0, limit - usedCount);
  return {
    plan,
    limit,
    usedCount,
    remaining,
    canCreate: usedCount < limit,
  };
}
