// Stripe client + plan configuration. This file is the SINGLE SOURCE OF
// TRUTH for plan limits and features — never hardcode plan numbers anywhere
// else in the app. Every limit check imports from PLANS below.
//
// The Stripe SDK is server-side only — STRIPE_SECRET_KEY must never be
// imported into a client component. The publishable key is fine on client.

import Stripe from "stripe";

// Read lazily so importing this module from a client component (which would
// just use the type exports) doesn't blow up at boot.
let cachedStripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. See STRIPE_SETUP.md to configure billing."
    );
  }
  // Don't pin apiVersion — let the installed SDK use its default. Pinning
  // requires keeping the literal in sync with the SDK's union type, which
  // shifts on every Stripe release. The webhook event handlers below are
  // resilient to small shape changes via narrow typing where it matters.
  cachedStripe = new Stripe(key);
  return cachedStripe;
}

// Lower-cased plan identifiers used throughout the codebase + DB.
export type PlanId = "free" | "starter" | "growth";

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
  /** Team seats (Phase 5). */
  teamMembers: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD (display only — Stripe is the source of truth). */
  price: number;
  /** Stripe Price ID. null for Free, undefined if env var missing. */
  priceId: string | null | undefined;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    priceId: null,
    limits: {
      messagesPerMonth: 500,
      templates: 3,
      campaignHistory: 10,
      phoneNumbers: 1,
      csvExport: false,
      googleDrive: false,
      teamMembers: 1,
    },
    features: [
      "500 messages per month",
      "1 WhatsApp number",
      "Up to 3 saved templates",
      "Last 10 campaigns",
      "Community support",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 29,
    priceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    limits: {
      messagesPerMonth: 5000,
      templates: Infinity,
      campaignHistory: Infinity,
      phoneNumbers: 1,
      csvExport: true,
      googleDrive: true,
      teamMembers: 1,
    },
    features: [
      "5,000 messages per month",
      "1 WhatsApp number",
      "Unlimited templates",
      "Full campaign history",
      "CSV export",
      "Google Drive import",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 79,
    priceId: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
    limits: {
      messagesPerMonth: 25000,
      templates: Infinity,
      campaignHistory: Infinity,
      phoneNumbers: 3,
      csvExport: true,
      googleDrive: true,
      teamMembers: 3,
    },
    features: [
      "25,000 messages per month",
      "3 WhatsApp numbers",
      "Unlimited templates",
      "Full campaign history",
      "CSV export",
      "Google Drive import",
      "Priority support",
      "Analytics dashboard",
      "Up to 3 team members",
    ],
  },
};

export function getPlan(plan: string | null | undefined): Plan {
  if (plan && plan in PLANS) return PLANS[plan as PlanId];
  return PLANS.free;
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return getPlan(plan).limits;
}

export function getPlanName(plan: string | null | undefined): string {
  return getPlan(plan).name;
}

/** Lookup a plan by its Stripe Price ID. Used by the webhook handler. */
export function getPlanByPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.priceId && p.priceId === priceId) return p;
  }
  return null;
}
