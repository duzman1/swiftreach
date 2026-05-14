// One-time Stripe Checkout for the $149 Done-For-You Setup. Distinct
// from /api/billing/create-checkout (which is subscription mode for
// Starter/Growth) — this one uses mode:"payment" and a single-charge
// price ID.
//
// On success the user is redirected to /onboarding?setup=requested
// and the Stripe `checkout.session.completed` webhook fires the
// admin + customer emails and stamps setupPaid + setupPaymentId on
// the User row. See app/api/billing/webhook/route.ts.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripeCustomer";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST() {
  try {
    const user = await requireUser();

    const priceId = process.env.STRIPE_SETUP_SERVICE_PRICE_ID?.trim();
    if (!priceId) {
      return bad(
        "Setup service price not configured. Set STRIPE_SETUP_SERVICE_PRICE_ID.",
        500
      );
    }

    const stripe = getStripe();

    // Reuse the same get-or-create helper so subscription + one-time
    // charges land under the same Stripe Customer for this user. Also
    // gives us the stale-customer recovery path: if the stored id is
    // from a prior test-mode customer that no longer exists in live
    // mode, the helper clears it and creates a fresh one rather than
    // 500'ing with "No such customer".
    const customerId = await getOrCreateCustomer(user);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        `${baseUrl}/onboarding?setup=requested&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/onboarding`,
      // The webhook (checkout.session.completed) reads these to know
      // it's the DFY setup, to identify the user, and to email
      // admin + customer with the right names.
      metadata: {
        userId: user.id,
        userEmail: user.email,
        userName: displayName,
        serviceType: "done_for_you_setup",
      },
      custom_text: {
        submit: {
          message:
            "After payment, we will contact you within 24 hours to schedule your setup.",
        },
      },
    });

    if (!session.url) {
      return bad("Stripe did not return a checkout URL", 500);
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    return handleApiError(err, "POST /api/billing/setup-service");
  }
}
