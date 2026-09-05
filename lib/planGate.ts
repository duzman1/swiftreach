// Paid-feature gating. Phase 6 retention features (scheduled, contact book,
// analytics, inbox) are paid-plan only — free users see a 403 with
// upgradeRequired:true so the client can render the upgrade prompt.
//
// Opt-out management is universal (all plans) — never gate it. WhatsApp
// compliance trumps tier.

import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { hasFeature, type FeatureKey } from "./plans";

export type PaidFeature =
  | "scheduled_campaigns"
  | "contact_book"
  | "analytics"
  | "inbox"
  | "google_drive";

const FEATURE_COPY: Record<PaidFeature, string> = {
  scheduled_campaigns: "Scheduled & recurring campaigns",
  contact_book: "Permanent contact book",
  analytics: "Analytics dashboard",
  inbox: "Two-way messaging inbox",
  google_drive: "Google Drive import",
};

/**
 * Returns null if the user is on a paid plan; returns a 403 NextResponse
 * (with `upgradeRequired:true`) if they're on free. Caller should `if`
 * the response and return it directly.
 *
 * This is the SINGLE source of truth for paid-feature gates. Don't add
 * inline `plan === "free"` checks elsewhere — funnel through here.
 */
export async function requirePaidPlan(
  userId: string,
  feature: PaidFeature
): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "User not found" },
      { status: 404 }
    );
  }
  if (user.plan === "free") {
    return NextResponse.json(
      {
        ok: false,
        error: `${FEATURE_COPY[feature]} requires Starter or Growth.`,
        upgradeRequired: true,
        feature,
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Synchronous version for layouts/pages that already loaded the user.
 * Returns true when the user is allowed to access the feature.
 */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "starter" || plan === "growth" || plan === "pro";
}

/**
 * Feature-level gate that maps directly to the FeatureKey enum in
 * lib/plans.ts. Returns null when the user's plan grants the feature,
 * or a 403 NextResponse with upgradeRequired: true when it doesn't.
 * Use this in API routes for finer-grained gating than the coarse
 * requirePaidPlan() — e.g. individual analytics panels where "basic"
 * views are free but "full analytics" is Growth+.
 */
export async function requireFeature(
  userId: string,
  featureKey: FeatureKey
): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "User not found" },
      { status: 404 }
    );
  }
  if (!hasFeature(user.plan, featureKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: `This feature requires a higher plan.`,
        upgradeRequired: true,
        feature: featureKey,
      },
      { status: 403 }
    );
  }
  return null;
}
