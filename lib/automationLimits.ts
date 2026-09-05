// Plan-tier limits for the automations feature. All numbers now flow
// from lib/plans.ts — this module is a thin helper that turns "how
// many can this user still create?" into a query against the DB.
//
// FIX 2B: the AUTOMATION_LIMITS map used to live here as its own
// source of truth. It was moved into PLANS.<tier>.limits.automations
// so pricing pages and enforcement can't drift.

import { prisma } from "./prisma";
import { getLimit } from "./plans";

/** Backwards-compat re-export. New callers should read `getLimit(plan,
 *  "automations")` directly. `null` in PLANS means "unlimited"; we
 *  translate to Infinity here for existing arithmetic. */
export const AUTOMATION_LIMITS: Record<string, number> = new Proxy(
  {} as Record<string, number>,
  {
    get(_target, planId: string) {
      const limit = getLimit(planId, "automations");
      return limit === null ? Number.POSITIVE_INFINITY : limit ?? 0;
    },
  }
);

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
  const planLimit = getLimit(plan, "automations");
  const limit =
    planLimit === null ? Number.POSITIVE_INFINITY : planLimit ?? 0;
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
