// Helpers for retrieving or creating a Stripe Customer for a SwiftReach
// user. Wraps the common "stored ID might be stale" failure mode that
// surfaces after Stripe TEST → LIVE mode flips, after Clerk dev → prod
// flips (different user rows pointing at the old test customer), or any
// other situation where the saved id doesn't exist in the current
// Stripe account.
//
// `getOrCreateCustomer` always returns a valid customer id for the user.
// It first verifies the stored id; if Stripe returns resource_missing
// it clears the stale fields and creates a fresh customer.
//
// `getValidCustomerId` returns null instead of creating, so callers like
// the Customer Portal can short-circuit with "subscribe first" instead
// of silently spawning a Stripe row for someone who never paid.

import Stripe from "stripe";
import { prisma } from "./prisma";
import { getStripe } from "./stripe";

// Narrow the unknown Stripe SDK error shape so we can read .code.
function isResourceMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; type?: unknown };
  return e.code === "resource_missing";
}

interface UserLike {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  stripeCustomerId: string | null;
}

/**
 * Verifies the stored stripeCustomerId still exists in Stripe. If it
 * doesn't, clears every Stripe-related field on the user (customer id,
 * subscription id + status, price id, plan → "free") so the next paid
 * action creates a clean row. Returns true if the customer is valid,
 * false if it was stale and has been cleared.
 *
 * Other Stripe errors are re-thrown so the route handler's catch
 * block surfaces them — we only want to swallow "this customer
 * doesn't exist in this Stripe account", nothing else.
 */
export async function verifyOrClearStaleCustomer(
  userId: string,
  customerId: string | null,
  stripe: Stripe = getStripe()
): Promise<boolean> {
  if (!customerId) return false;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    // Stripe returns a DeletedCustomer object if the customer was
    // deleted. Treat that as stale too.
    if ("deleted" in customer && customer.deleted) {
      throw Object.assign(new Error("Customer was deleted"), {
        code: "resource_missing",
      });
    }
    return true;
  } catch (err) {
    if (!isResourceMissing(err)) throw err;
    // Clear everything Stripe-related on this user so we start fresh.
    await prisma.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripePriceId: null,
        plan: "free",
      },
    });
    return false;
  }
}

/**
 * Get-or-create a Stripe customer for the user. Verifies the stored id
 * first; if it's stale, creates a fresh customer and persists the new
 * id. Always returns a usable customer id.
 */
export async function getOrCreateCustomer(user: UserLike): Promise<string> {
  const stripe = getStripe();

  const stillValid = await verifyOrClearStaleCustomer(
    user.id,
    user.stripeCustomerId,
    stripe
  );
  if (stillValid && user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;
  const customer = await stripe.customers.create({
    email: user.email,
    name: displayName,
    metadata: { userId: user.id },
    description: "SwiftReach subscriber",
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Verify-only variant for read-side routes like the Customer Portal.
 * Returns the customer id if it's valid, null if it's missing or
 * stale (and clears the stale id as a side effect). Never creates.
 */
export async function getValidCustomerId(
  userId: string,
  customerId: string | null
): Promise<string | null> {
  const stillValid = await verifyOrClearStaleCustomer(userId, customerId);
  return stillValid ? customerId : null;
}
