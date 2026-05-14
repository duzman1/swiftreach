// One-off cleanup: walks every User row with a saved stripeCustomerId,
// pings Stripe to verify the customer still exists, and clears the
// stored fields (customer id, subscription id/status, price id, plan)
// when Stripe returns resource_missing.
//
// Why: after flipping Stripe TEST → LIVE mode (or migrating to a new
// Stripe account, or doing a Clerk dev→prod that copied test-mode
// customer ids over into production rows), the saved
// stripeCustomerId points at a customer that no longer exists in the
// CURRENT Stripe account. Any checkout call then bombs with
// "No such customer: cus_xxx". Clearing the stale ids lets the
// route's get-or-create helper mint a fresh customer on next use.
//
// Run with:
//   node --env-file=.env scripts/fix-stripe-customers.mjs
//
// --env-file lands DATABASE_URL + STRIPE_SECRET_KEY into process.env
// without needing dotenv. Requires Node 20+.

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY not set.");
  process.exit(1);
}

const prisma = new PrismaClient();
const stripe = new Stripe(stripeKey);

async function main() {
  const users = await prisma.user.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, email: true, stripeCustomerId: true },
  });

  console.log(`Checking ${users.length} user(s) with a saved Stripe customer id…\n`);

  let valid = 0;
  let cleared = 0;
  let errors = 0;

  for (const user of users) {
    const id = user.stripeCustomerId;
    if (!id) continue;
    try {
      const cust = await stripe.customers.retrieve(id);
      // Treat deleted-but-known customers as stale too.
      if (typeof cust === "object" && "deleted" in cust && cust.deleted) {
        await clear(user);
        cleared++;
        console.log(`🔧 Cleared (deleted): ${user.email}  ${id}`);
      } else {
        valid++;
        console.log(`✅ Valid:              ${user.email}  ${id}`);
      }
    } catch (err) {
      const code = err && typeof err === "object" ? err.code : undefined;
      if (code === "resource_missing") {
        await clear(user);
        cleared++;
        console.log(`🔧 Cleared (missing):  ${user.email}  ${id}`);
      } else {
        errors++;
        console.error(
          `⚠  Unexpected error for ${user.email}:`,
          err && err.message ? err.message : err
        );
      }
    }
  }

  console.log(
    `\nDone. valid=${valid}  cleared=${cleared}  errors=${errors}`
  );
}

async function clear(user) {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      stripePriceId: null,
      plan: "free",
    },
  });
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
