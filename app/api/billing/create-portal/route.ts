// Open the Stripe Customer Portal for managing/cancelling a subscription.
// We never build our own cancel/payment-method UI — Stripe's portal handles
// it all and stays compliant.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";
import { getValidCustomerId } from "@/lib/stripeCustomer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();

    // Verify the stored stripeCustomerId still exists in the current
    // Stripe account. If it's stale (test→live flip, etc.) the helper
    // clears it and returns null — we then tell the user to subscribe
    // first instead of silently creating a fresh customer row. The
    // portal is read-only access to an existing billing relationship.
    const customerId = await getValidCustomerId(user.id, user.stripeCustomerId);
    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No billing account found. Please subscribe first.",
        },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/billing`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    return handleApiError(err, "POST /api/billing/create-portal");
  }
}
