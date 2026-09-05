// Create a Stripe Checkout session for upgrading to a paid plan.
// Accepts both a plan id and a billing interval ("month" | "year")
// and resolves to the appropriate Stripe price id via
// lib/plans.ts's priceIdFor(). Falls back to legacy behaviour if only
// a raw priceId is supplied.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";
import {
  PLANS,
  priceIdFor,
  planFromPriceId,
  type PlanId,
  type BillingInterval,
} from "@/lib/plans";
import { getOrCreateCustomer } from "@/lib/stripeCustomer";

export const dynamic = "force-dynamic";

interface Body {
  /** Preferred: pass a plan id + interval. Interval defaults to "month". */
  plan?: PlanId;
  interval?: BillingInterval;
  /** Legacy: pass a raw Stripe price id. Interval is inferred from the mapping. */
  priceId?: string;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    let body: Body = {};
    try {
      body = await req.json();
    } catch {
      /* empty body — validated below */
    }

    // Resolve plan + interval + priceId.
    let planId: PlanId | null = null;
    let interval: BillingInterval = body.interval === "year" ? "year" : "month";
    let priceId: string | null = null;

    if (body.plan && body.plan in PLANS) {
      planId = body.plan;
      priceId = priceIdFor(planId, interval);
    } else if (body.priceId) {
      // Legacy path — infer the (planId, interval) tuple from the priceId
      // so metadata + billingInterval land correctly.
      const mapping = planFromPriceId(body.priceId);
      if (mapping) {
        planId = mapping.planId;
        interval = mapping.interval;
        priceId = body.priceId;
      }
    }

    if (!planId || planId === "free") {
      return bad("Pick a paid plan to upgrade.");
    }
    if (!priceId) {
      return bad(
        `The ${planId} plan is not configured for ${interval} billing yet. Add STRIPE_${planId.toUpperCase()}_${interval === "year" ? "ANNUAL" : "MONTHLY"}_PRICE_ID to env vars.`
      );
    }

    // Logged assertion for QA — proves the priceId Stripe sees
    // matches the interval the user selected. If the user picks
    // Annual and this log shows an ENV slot containing MONTHLY, the
    // toggle wiring is broken. Also useful for debugging env
    // configuration drift between environments.
    const envSlot =
      interval === "year"
        ? `STRIPE_${planId.toUpperCase()}_ANNUAL_PRICE_ID`
        : `STRIPE_${planId.toUpperCase()}_MONTHLY_PRICE_ID`;
    // eslint-disable-next-line no-console
    console.log(
      `[billing.checkout] plan=${planId} interval=${interval} priceId=${priceId.substring(0, 15)}… (from ${envSlot})`
    );

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(user);

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing`,
      // Webhook needs metadata.userId / plan / interval to update the right row.
      // We ALSO trust priceId → mapping via planFromPriceId() as the source
      // of truth in the webhook (Customer Portal upgrades can leave stale
      // metadata) — but writing metadata is still useful for audit trails.
      metadata: { userId: user.id, plan: planId, interval },
      subscription_data: {
        metadata: { userId: user.id, plan: planId, interval },
      },
      allow_promotion_codes: true,
      custom_text: {
        submit: {
          message:
            interval === "year"
              ? "Billed annually. Cancel anytime; you keep access until the period ends."
              : "Billed monthly. Cancel anytime.",
        },
      },
      // Note: no payment_method_options.setup_future_usage here.
      // In subscription mode Stripe automatically saves the card for
      // recurring charges; setting it explicitly now returns
      // "You can not pass `payment_method_options[setup_future_usage]`
      // in `subscription` mode." from the Stripe API.
    });

    if (!session.url) {
      return bad("Stripe did not return a checkout URL", 500);
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    return handleApiError(err, "POST /api/billing/create-checkout");
  }
}
