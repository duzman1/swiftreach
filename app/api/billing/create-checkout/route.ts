// Create a Stripe Checkout session for upgrading to a paid plan. Called by
// the /billing page when the user clicks an Upgrade button.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe, getPlan, PLANS, type PlanId } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripeCustomer";

export const dynamic = "force-dynamic";

interface Body {
  /** Either pass a plan id ("starter" | "growth") or an explicit Stripe price id. */
  plan?: PlanId;
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
      // Empty body is OK — caller can specify in query, but plan is required
      // somehow.
    }

    // Resolve which plan / price to charge for.
    let planId: PlanId | null = null;
    let priceId: string | null = null;

    if (body.plan && body.plan in PLANS) {
      planId = body.plan;
      priceId = getPlan(planId).priceId ?? null;
    } else if (body.priceId) {
      priceId = body.priceId;
      // Reverse-lookup the plan id so it lands in metadata.
      for (const p of Object.values(PLANS)) {
        if (p.priceId === priceId) planId = p.id;
      }
    }

    if (!planId || planId === "free") {
      return bad("Pick a paid plan to upgrade.");
    }
    if (!priceId) {
      return bad(
        "This plan isn't configured for billing yet. Add the Stripe Price ID to env vars."
      );
    }

    const stripe = getStripe();

    // Get-or-create the Stripe customer for this user. The helper verifies
    // the stored id against the current Stripe account first — if it's
    // stale (test→live mode flip, Clerk dev→prod migration that pointed at
    // an old test customer, etc.) it clears the row and creates a fresh
    // customer so checkout doesn't bomb with "No such customer".
    const customerId = await getOrCreateCustomer(user);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing`,
      // Webhook needs metadata.userId/plan to update the right row.
      metadata: { userId: user.id, plan: planId },
      subscription_data: {
        metadata: { userId: user.id, plan: planId },
      },
      allow_promotion_codes: true,
      // Reassurance copy under the "Subscribe" button. Stripe renders
      // this verbatim — keep it short and matter-of-fact.
      custom_text: {
        submit: {
          message:
            "Your subscription will be billed monthly. Cancel anytime.",
        },
      },
      // Tell Stripe to save the card for off-session reuse (renewals).
      // Without this, recurring charges can fall back to fresh
      // authentication on each cycle — annoying for the customer and a
      // common cause of involuntary churn.
      payment_method_options: {
        card: {
          setup_future_usage: "off_session",
        },
      },
    });

    if (!session.url) {
      return bad("Stripe did not return a checkout URL", 500);
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    return handleApiError(err, "POST /api/billing/create-checkout");
  }
}
