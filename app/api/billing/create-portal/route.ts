// Open the Stripe Customer Portal for managing/cancelling a subscription.
// We never build our own cancel/payment-method UI — Stripe's portal handles
// it all and stays compliant.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user.stripeCustomerId) {
      return NextResponse.json(
        {
          ok: false,
          error: "You don't have a billing account yet. Upgrade to a paid plan first.",
        },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    return handleApiError(err, "POST /api/billing/create-portal");
  }
}
