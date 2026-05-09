# Stripe Billing Setup

SwiftReach uses Stripe for subscription billing. This guide walks you from
zero to a working billing flow — Test mode first, Live mode when you're
ready for real payments.

Allow ~20 minutes the first time.

---

## Step 1 — Create a Stripe account

Go to <https://stripe.com> and sign up (free). You don't need to complete
business verification yet — Test mode works without it.

In the dashboard's top-right corner, **make sure "Test mode" is toggled ON**
while you're setting things up. Test mode uses fake money and fake cards.

## Step 2 — Copy your API keys

Dashboard → **Developers → API Keys**.

| Field in Stripe | Goes into `.env.local` as |
|---|---|
| **Publishable key** (`pk_test_...`) | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Secret key** (`sk_test_...`) | `STRIPE_SECRET_KEY` |

Click "Reveal test key" for the secret. **Copy it once — paste it straight
into `.env.local`, not into chat.**

## Step 3 — Create the two products

Dashboard → **Product Catalog → Add Product**.

### Product: SwiftReach Starter

- **Name:** `SwiftReach Starter`
- **Description:** (optional, e.g. "5,000 messages per month")
- **Pricing:**
  - Type: **Recurring**
  - Price: **$29.00 USD**
  - Billing period: **Monthly**
- Click **Save product**.

After save, the product detail page lists the price with a Price ID
starting with `price_...`. Copy it → paste into `.env.local` as
`STRIPE_STARTER_MONTHLY_PRICE_ID`.

### Product: SwiftReach Growth

Same flow:

- **Name:** `SwiftReach Growth`
- **Price:** **$79.00 USD** monthly
- Copy the Price ID → `STRIPE_GROWTH_MONTHLY_PRICE_ID`.

## Step 4 — Set up the webhook

Stripe POSTs subscription lifecycle events to our app. Without this, plan
upgrades won't reflect in the database.

Dashboard → **Developers → Webhooks → Add endpoint**.

| Field | Value |
|---|---|
| Endpoint URL | `https://www.swiftreach.app/api/billing/webhook` |
| Description | `SwiftReach billing events` |

**Events to send** — click "Select events" and tick:

- ☑ `customer.subscription.created`
- ☑ `customer.subscription.updated`
- ☑ `customer.subscription.deleted`
- ☑ `invoice.paid`
- ☑ `invoice.payment_failed`

Click **Add endpoint**.

Open the new endpoint → **Signing secret** → click **Reveal** → copy.
Paste into `.env.local` as `STRIPE_WEBHOOK_SECRET` (starts with `whsec_`).

> **Local testing:** Stripe can't reach `localhost`. Use the Stripe CLI
> to forward events: `stripe login` → `stripe listen --forward-to localhost:3000/api/billing/webhook`.
> The CLI prints a Test-mode webhook secret you can use temporarily.

## Step 5 — Enable the Customer Portal

Stripe's hosted Customer Portal handles cancel / update-card / view-invoices
flows for you.

Dashboard → **Settings → Billing → Customer portal** (URL pattern:
`/test/settings/billing/portal`).

Tick:

- ☑ **Customers can cancel subscriptions**
- ☑ **Customers can update payment methods**
- ☑ **Customers can switch plans** (lets users downgrade between Starter/Growth)
- ☑ **Customers can view invoice history**

**Default redirect URL:** `https://www.swiftreach.app/billing`

Click **Save**.

## Step 6 — Add the keys to `.env.local`

Your file should now have:

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_GROWTH_MONTHLY_PRICE_ID=price_...
```

Restart `npm run dev` so the new env values get baked in.

## Step 7 — Add the same keys to Vercel

For production:

1. Vercel project → **Settings → Environment Variables**
2. Add all five Stripe variables for **Production** (and **Preview** if you
   want preview deploys to bill in test mode too).
3. **Redeploy** with cache disabled so the new env values bake in.

## Step 8 — Test the full flow

In Test mode, Stripe accepts these special cards:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0341` | Charges succeed but later **payment_failed** webhook fires |
| `4000 0025 0000 3155` | Triggers 3D Secure / SCA |

Any future expiry date, any 3-digit CVC, any ZIP.

Test scenarios:

1. **Free → Starter:** Click Upgrade on `/billing`. Use card `4242...`.
   Confirm `/billing` shows "Active" and the dashboard usage meter says
   "Plan: Starter".
2. **Starter → Growth:** Click Manage Subscription → Stripe portal lets you
   switch plans.
3. **Cancel:** Stripe portal → Cancel subscription. After cycle end, plan
   reverts to Free. With `cancel_at_period_end`, `/billing` shows "Cancels
   on …" and a Reactivate button.
4. **Failed payment:** Use `4000 0000 0000 0341` for the next renewal. The
   `invoice.payment_failed` webhook flips the status to `past_due` and the
   Manage Subscription button switches to "Update Payment Method".
5. **Limit reached:** Send 500 messages on Free, then try campaign #501.
   `/billing` says you're at 500/500; the campaign send returns a 403.

## Step 9 — Going live

When you're ready for real payments:

1. Complete Stripe **business verification** (legal name, tax ID, bank).
   Required to accept live payments.
2. Toggle off **Test mode** in the dashboard.
3. Repeat steps 2-5 in **Live mode** — keys, products, webhook, customer
   portal config are all separate per mode.
4. Update **all five env vars** in Vercel to the live values (`sk_live_`,
   `pk_live_`, `whsec_` from the live webhook, live `price_` IDs).
5. Redeploy.
6. Charge a small amount on a real card to verify the round-trip.

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| "Stripe Price ID not set" on /billing | Add `STRIPE_STARTER_MONTHLY_PRICE_ID` and/or `STRIPE_GROWTH_MONTHLY_PRICE_ID` and redeploy. |
| Checkout opens but plan never updates after payment | Webhook isn't firing. Check Stripe → Webhooks → your endpoint → "Recent events" for retries. The signing secret may be wrong, or the URL not reachable. |
| `Invalid signature` in webhook logs | `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint. Re-copy from the Webhook detail page. Each webhook endpoint has its OWN secret. |
| User stuck on `past_due` after updating card | Stripe re-attempts the failed invoice automatically; can take up to 24h. Or charge manually from the Customers tab in Stripe. |
| Plan downgrades but DB still says Starter | The `customer.subscription.updated` event fires on plan switch. If your endpoint isn't subscribed to it, plan changes silently don't propagate. |
