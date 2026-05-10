// Stripe webhook handler. Stripe POSTs subscription lifecycle events here;
// we mirror them onto the User row so the rest of the app can trust the DB
// as its source of truth for plan + usage.
//
// Signature verification uses Stripe's own SDK (constructEvent). The signing
// secret comes from STRIPE_WEBHOOK_SECRET — get it from the Webhooks page in
// the Stripe dashboard.
//
// Public route — Stripe can't authenticate via Clerk. Middleware lists this
// path explicitly. The signature check is the access control.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, getPlanByPriceId } from "@/lib/stripe";
import { resetMonthlyUsage } from "@/lib/usageCheck";

// The Stripe SDK shifts which fields live on Subscription vs SubscriptionItem
// across versions. v17+ moved current_period_* onto each SubscriptionItem
// and removed invoice.subscription as a top-level field. We read with both
// shapes to stay forward-compatible.
type SubLegacy = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

type SubscriptionItemLegacy = Stripe.SubscriptionItem & {
  current_period_start?: number;
  current_period_end?: number;
};

type InvoiceWithSub = Stripe.Invoice & {
  subscription?: string | { id: string } | null;
};

function readSubscriptionId(invoice: InvoiceWithSub): string | null {
  const s = invoice.subscription;
  if (!s) return null;
  return typeof s === "string" ? s : s.id;
}

/**
 * Pull current_period_{start,end} from wherever the installed Stripe SDK
 * surfaces them. Older API versions: top-level on Subscription. Newer (v17+):
 * on each SubscriptionItem. Returns Unix seconds or undefined.
 */
function readCurrentPeriod(sub: SubLegacy): {
  start?: number;
  end?: number;
} {
  // Newer shape — read from the first item.
  const item = sub.items?.data?.[0] as SubscriptionItemLegacy | undefined;
  const itemStart = item?.current_period_start;
  const itemEnd = item?.current_period_end;
  if (itemStart || itemEnd) {
    return { start: itemStart, end: itemEnd };
  }
  // Legacy shape — fall back to top-level.
  return { start: sub.current_period_start, end: sub.current_period_end };
}

export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith("whsec_")) {
    // Surface but don't 5xx — Stripe retries forever on 5xx.
    // eslint-disable-next-line no-console
    console.error("STRIPE_WEBHOOK_SECRET not configured — skipping event.");
    return NextResponse.json({ ok: false, skipped: "no secret configured" });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return bad(400, "Missing stripe-signature header");

  // Stripe needs the raw request body for HMAC verification. Don't parse JSON
  // first.
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Stripe webhook signature failed:", err);
    return bad(400, "Invalid signature");
  }

  try {
    switch (event.type) {
      // ─── Subscription created or updated ─────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as SubLegacy;
        const userId = sub.metadata?.userId;
        if (!userId) {
          // eslint-disable-next-line no-console
          console.warn("subscription event missing userId metadata", sub.id);
          break;
        }
        const priceId = sub.items.data[0]?.price.id ?? null;
        // Resolve plan from priceId rather than trusting metadata alone — if
        // the user upgraded via the Customer Portal, metadata may be stale.
        const plan = getPlanByPriceId(priceId)?.id ?? sub.metadata?.plan ?? "free";
        const period = readCurrentPeriod(sub);
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            stripeSubscriptionId: sub.id,
            stripeSubscriptionStatus: sub.status,
            stripePriceId: priceId,
            currentPeriodStart: period.start ? new Date(period.start * 1000) : null,
            currentPeriodEnd: period.end ? new Date(period.end * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
        break;
      }

      // ─── Subscription cancelled (period ended) ───────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: "free",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: "canceled",
            stripePriceId: null,
            cancelAtPeriodEnd: false,
          },
        });
        break;
      }

      // ─── Successful invoice payment — reset monthly usage ────────────────
      case "invoice.paid": {
        const invoice = event.data.object as InvoiceWithSub;
        const subId = readSubscriptionId(invoice);
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          const userId = sub.metadata?.userId;
          if (userId) await resetMonthlyUsage(userId);
        }
        break;
      }

      // ─── Failed payment — flag account as past_due ───────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as InvoiceWithSub;
        const subId = readSubscriptionId(invoice);
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          const userId = sub.metadata?.userId;
          if (userId) {
            await prisma.user.update({
              where: { id: userId },
              data: { stripeSubscriptionStatus: "past_due" },
            });
          }
        }
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Stripe webhook handler error:", err);
    // Return 500 so Stripe retries — DB hiccup, transient downstream, etc.
    return bad(500, "Handler error");
  }
}
