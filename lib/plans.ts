// SINGLE SOURCE OF TRUTH for SwiftReach plan pricing, limits, features,
// and Stripe price-id mappings.
//
// Never hardcode plan numbers, message limits, or feature flags anywhere
// else. Every check should route through getLimit() / hasFeature() /
// isAtOrAbove().
//
// CRITICAL BEHAVIOUR:
// Plan access is decided by the `plan` field on the user record ONLY.
// The Stripe subscription status is displayed in the UI but is never
// used to gate feature access. Comped accounts, beta users, and admin
// overrides that set plan="pro" manually with no active Stripe
// subscription must still get full pro access. We had a regression in
// an earlier version that additionally required stripeSubscriptionStatus
// === "active" — do NOT reintroduce that pattern.

export type PlanId = "free" | "starter" | "growth" | "pro";
export type BillingInterval = "month" | "year";

export type LimitKey =
  | "messagesPerMonth"
  | "whatsappNumbers"
  | "savedTemplates"
  | "campaignHistory"
  | "teamMembers"
  | "automations"
  | "apiKeys";

export type FeatureKey =
  | "csvExport"
  | "googleDriveImport"
  | "scheduledCampaigns"
  | "fullAnalytics"
  | "analyticsExport"
  | "savedAudiences"
  | "whiteLabelReports"
  | "clientWorkspaces"
  | "customOnboarding";

// null means "unlimited" throughout.
export interface PlanLimitsV2 {
  messagesPerMonth: number;
  whatsappNumbers: number;
  savedTemplates: number | null;
  campaignHistory: number | null;
  teamMembers: number;
  /** Max active/paused automations. 0 = feature disabled. null = unlimited. */
  automations: number | null;
  /** Max active API keys. 0 = feature disabled. */
  apiKeys: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD */
  monthlyPrice: number;
  /** Annual price in USD (2 months free vs 12 × monthly) */
  annualPrice: number;
  stripeMonthlyPriceId: string | null;
  stripeAnnualPriceId: string | null;
  limits: PlanLimitsV2;
  features: Record<FeatureKey, boolean>;
  supportSla: string;
}

// Tier order — used by isAtOrAbove() and admin plan sorting.
const TIER_ORDER: PlanId[] = ["free", "starter", "growth", "pro"];

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : null;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    stripeMonthlyPriceId: null,
    stripeAnnualPriceId: null,
    limits: {
      messagesPerMonth: 500,
      whatsappNumbers: 1,
      savedTemplates: 3,
      campaignHistory: 10,
      teamMembers: 1,
      automations: 0,
      apiKeys: 0,
    },
    features: {
      csvExport: false,
      googleDriveImport: false,
      scheduledCampaigns: false,
      fullAnalytics: false,
      analyticsExport: false,
      savedAudiences: false,
      whiteLabelReports: false,
      clientWorkspaces: false,
      customOnboarding: false,
    },
    supportSla: "Community support",
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    annualPrice: 290,
    stripeMonthlyPriceId: env("STRIPE_STARTER_MONTHLY_PRICE_ID"),
    stripeAnnualPriceId: env("STRIPE_STARTER_ANNUAL_PRICE_ID"),
    limits: {
      messagesPerMonth: 5000,
      whatsappNumbers: 1,
      savedTemplates: null, // unlimited
      campaignHistory: null,
      teamMembers: 1,
      automations: 2,
      apiKeys: 1,
    },
    features: {
      csvExport: true,
      googleDriveImport: true,
      scheduledCampaigns: true, // moved DOWN from Growth per new pricing
      fullAnalytics: false,
      analyticsExport: false,
      savedAudiences: false,
      whiteLabelReports: false,
      clientWorkspaces: false,
      customOnboarding: false,
    },
    supportSla: "24-hour email support",
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 79,
    annualPrice: 790,
    stripeMonthlyPriceId: env("STRIPE_GROWTH_MONTHLY_PRICE_ID"),
    stripeAnnualPriceId: env("STRIPE_GROWTH_ANNUAL_PRICE_ID"),
    limits: {
      messagesPerMonth: 25000,
      whatsappNumbers: 3,
      savedTemplates: null,
      campaignHistory: null,
      teamMembers: 3,
      automations: 10,
      apiKeys: 3,
    },
    features: {
      csvExport: true,
      googleDriveImport: true,
      scheduledCampaigns: true,
      fullAnalytics: true,
      analyticsExport: false,
      savedAudiences: true,
      whiteLabelReports: false,
      clientWorkspaces: false,
      customOnboarding: false,
    },
    supportSla: "12-hour priority support",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 149,
    annualPrice: 1490,
    stripeMonthlyPriceId: env("STRIPE_PRO_MONTHLY_PRICE_ID"),
    stripeAnnualPriceId: env("STRIPE_PRO_ANNUAL_PRICE_ID"),
    limits: {
      messagesPerMonth: 100000,
      whatsappNumbers: 10,
      savedTemplates: null,
      campaignHistory: null,
      teamMembers: 10,
      automations: null, // unlimited
      apiKeys: 10,
    },
    features: {
      csvExport: true,
      googleDriveImport: true,
      scheduledCampaigns: true,
      fullAnalytics: true,
      analyticsExport: true,
      savedAudiences: true,
      whiteLabelReports: true,
      clientWorkspaces: true,
      customOnboarding: true,
    },
    supportSla: "4-hour priority support",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Normalize any string (or null/undefined) to a Plan, defaulting to free. */
export function getPlan(planId: string | null | undefined): Plan {
  if (planId && planId in PLANS) return PLANS[planId as PlanId];
  return PLANS.free;
}

/** Number, or null for unlimited. Unknown planId → free. */
export function getLimit(
  planId: string | null | undefined,
  limitKey: LimitKey
): number | null {
  return getPlan(planId).limits[limitKey];
}

export function hasFeature(
  planId: string | null | undefined,
  featureKey: FeatureKey
): boolean {
  return getPlan(planId).features[featureKey];
}

/** Compare tiers. free < starter < growth < pro. Unknown plans compare as free. */
export function isAtOrAbove(
  planId: string | null | undefined,
  minimumPlan: PlanId
): boolean {
  const a = TIER_ORDER.indexOf(getPlan(planId).id);
  const b = TIER_ORDER.indexOf(minimumPlan);
  return a >= b;
}

/** Given a Stripe price id, return { planId, interval } — or null if
 *  the price id isn't configured on any plan. Called by the webhook to
 *  keep the DB in sync with what Stripe considers the active plan. */
export function planFromPriceId(
  priceId: string | null | undefined
): { planId: PlanId; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.stripeMonthlyPriceId === priceId)
      return { planId: p.id, interval: "month" };
    if (p.stripeAnnualPriceId === priceId)
      return { planId: p.id, interval: "year" };
  }
  return null;
}

/** Given a plan id + interval, return the configured Stripe price id
 *  or null if that combination isn't set in env. Used by checkout. */
export function priceIdFor(
  planId: PlanId,
  interval: BillingInterval
): string | null {
  const p = PLANS[planId];
  if (!p) return null;
  return interval === "year" ? p.stripeAnnualPriceId : p.stripeMonthlyPriceId;
}

/** For the admin MRR calculation. Annual plans divided by 12. */
export function normalizedMonthlyRevenue(
  planId: string | null | undefined,
  interval: BillingInterval
): number {
  const p = getPlan(planId);
  if (p.id === "free") return 0;
  return interval === "year" ? p.annualPrice / 12 : p.monthlyPrice;
}

/** Human-readable interval label. */
export function formatInterval(interval: BillingInterval): string {
  return interval === "year" ? "annually" : "monthly";
}

/** All plans in display order. */
export function getAllPlansOrdered(): Plan[] {
  return TIER_ORDER.map((id) => PLANS[id]);
}

/** Return the plan immediately below the given one in the tier order,
 *  or null if this is already the lowest tier (free). Used by the
 *  billing UI to render "Everything in <previous plan>" bullets
 *  without hardcoding plan names. */
export function getPreviousPlan(planId: PlanId): Plan | null {
  const idx = TIER_ORDER.indexOf(planId);
  if (idx <= 0) return null;
  return PLANS[TIER_ORDER[idx - 1]];
}
