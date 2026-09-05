// Stripe SDK client + backward-compatible re-exports of the OLD plan
// helpers.
//
// The authoritative source for plan pricing, limits, features, and
// price-id mappings is now lib/plans.ts. This file exists for two
// reasons:
//
//   1. The Stripe SDK client getStripe() lives here — kept in place so
//      the 20+ imports of it don't have to churn.
//
//   2. It preserves the old public surface (PLANS, getPlan,
//      getPlanLimits, getPlanName, getPlanByPriceId, PlanId, Plan,
//      PlanLimits) that ~27 files across the codebase import. Those
//      re-exports are thin adapters onto the new lib/plans.ts data,
//      shaped like the old PLANS record so existing call sites see
//      the additional "pro" tier without needing code changes.
//
// New code should import directly from lib/plans.ts and use the new
// helpers (getLimit, hasFeature, isAtOrAbove, planFromPriceId).

import Stripe from "stripe";
import {
  PLANS as NEW_PLANS,
  getPlan as newGetPlan,
  type Plan as NewPlan,
  type PlanId as NewPlanId,
} from "./plans";

// ── Stripe SDK client ─────────────────────────────────────────────────

let cachedStripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. See STRIPE_SETUP.md to configure billing."
    );
  }
  cachedStripe = new Stripe(key);
  return cachedStripe;
}

// ── Legacy plan type surface — do not use in new code ─────────────────

export type PlanId = NewPlanId;

export interface PlanLimits {
  /** Hard cap on outbound WhatsApp messages per billing cycle. */
  messagesPerMonth: number;
  /** Max saved templates. Infinity for paid plans. */
  templates: number;
  /** Most-recent-N campaigns shown in /campaigns. Infinity for paid. */
  campaignHistory: number;
  /** Number of WhatsApp phone number IDs the user can configure. */
  phoneNumbers: number;
  /** Whether CSV export is allowed. */
  csvExport: boolean;
  /** Whether the Google Drive picker is enabled. */
  googleDrive: boolean;
  /** Team seats. */
  teamMembers: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  priceId: string | null | undefined;
  limits: PlanLimits;
  features: string[];
}

// Adapt a new-shape Plan → old-shape Plan for legacy consumers.
function toLegacy(p: NewPlan): Plan {
  const featureStrings: string[] = [];
  featureStrings.push(`${p.limits.messagesPerMonth.toLocaleString()} messages per month`);
  featureStrings.push(`${p.limits.whatsappNumbers} WhatsApp number${p.limits.whatsappNumbers === 1 ? "" : "s"}`);
  featureStrings.push(
    p.limits.savedTemplates === null
      ? "Unlimited templates"
      : `Up to ${p.limits.savedTemplates} saved templates`
  );
  featureStrings.push(
    p.limits.campaignHistory === null
      ? "Full campaign history"
      : `Last ${p.limits.campaignHistory} campaigns`
  );
  if (p.features.csvExport) featureStrings.push("CSV export");
  if (p.features.googleDriveImport) featureStrings.push("Google Drive import");
  if (p.features.scheduledCampaigns) featureStrings.push("Scheduled campaigns");
  if (p.features.fullAnalytics) featureStrings.push("Full analytics");
  if (p.features.analyticsExport) featureStrings.push("Analytics export");
  if (p.features.savedAudiences) featureStrings.push("Saved audiences");
  if (p.features.whiteLabelReports) featureStrings.push("White-label reports");
  if (p.features.clientWorkspaces) featureStrings.push("Client workspaces");
  if (p.features.customOnboarding) featureStrings.push("Custom onboarding");
  featureStrings.push(p.supportSla);

  return {
    id: p.id,
    name: p.name,
    price: p.monthlyPrice,
    // Legacy consumers expect a single priceId (monthly). Annual is
    // accessed via lib/plans.ts's stripeAnnualPriceId directly.
    priceId: p.stripeMonthlyPriceId,
    limits: {
      messagesPerMonth: p.limits.messagesPerMonth,
      templates:
        p.limits.savedTemplates === null ? Infinity : p.limits.savedTemplates,
      campaignHistory:
        p.limits.campaignHistory === null
          ? Infinity
          : p.limits.campaignHistory,
      phoneNumbers: p.limits.whatsappNumbers,
      csvExport: p.features.csvExport,
      googleDrive: p.features.googleDriveImport,
      teamMembers: p.limits.teamMembers,
    },
    features: featureStrings,
  };
}

/** LEGACY. PLANS[planId] returns an old-shape Plan for backward
 *  compatibility with the 20+ pre-existing imports of this record.
 *  New code should read from lib/plans.ts directly. */
export const PLANS: Record<PlanId, Plan> = {
  free: toLegacy(NEW_PLANS.free),
  starter: toLegacy(NEW_PLANS.starter),
  growth: toLegacy(NEW_PLANS.growth),
  pro: toLegacy(NEW_PLANS.pro),
};

export function getPlan(plan: string | null | undefined): Plan {
  return toLegacy(newGetPlan(plan));
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return getPlan(plan).limits;
}

export function getPlanName(plan: string | null | undefined): string {
  return getPlan(plan).name;
}

/** LEGACY. New code should call planFromPriceId() from lib/plans.ts
 *  which also returns the billing interval (month | year). */
export function getPlanByPriceId(
  priceId: string | null | undefined
): Plan | null {
  if (!priceId) return null;
  for (const p of Object.values(NEW_PLANS)) {
    if (p.stripeMonthlyPriceId === priceId || p.stripeAnnualPriceId === priceId) {
      return toLegacy(p);
    }
  }
  return null;
}
