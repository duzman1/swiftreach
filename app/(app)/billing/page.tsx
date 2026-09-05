// Billing management page. Shows the user's current plan, this period's
// usage, and the plan comparison grid for upgrades. Cancellations,
// downgrades, payment-method updates all go through the Stripe Customer
// Portal — opened by the "Manage Subscription" button.

import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { getPlan, type PlanId } from "@/lib/stripe";
import { getAllPlansOrdered, type BillingInterval } from "@/lib/plans";
import {
  firstOfNextMonthUtc,
  formatResetDate,
} from "@/lib/usagePeriod";
import { ensureUsagePeriodCurrent } from "@/lib/usageCheck";
import { PlanComparison } from "@/components/billing/PlanComparison";
import { PortalButton } from "@/components/billing/PortalButton";

export const dynamic = "force-dynamic";

// Copy keyed by the `?feature=...` query param. Set when the user gets
// redirected here by a paid-feature gate (currently only Google Drive
// import — see components/send/GoogleDrivePicker.tsx). Add new entries
// here when you gate more features.
const FEATURE_MESSAGES: Record<string, string> = {
  "google-drive-import":
    "Upgrade to import contacts directly from Google Drive.",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function pickStatusBadge(
  plan: PlanId,
  status: string | null,
  cancelAtPeriodEnd: boolean,
  periodEnd: Date | null
) {
  if (plan === "free") {
    return <Badge variant="secondary">Free</Badge>;
  }
  if (cancelAtPeriodEnd) {
    return (
      <Badge variant="warning">
        Cancels {periodEnd ? fmtDate(periodEnd) : ""}
      </Badge>
    );
  }
  if (status === "active" || status === "trialing") {
    return <Badge variant="success">{status === "trialing" ? "Trial" : "Active"}</Badge>;
  }
  if (status === "past_due") {
    return <Badge variant="destructive">Payment Failed</Badge>;
  }
  if (status === "canceled") {
    return <Badge variant="secondary">Cancelled</Badge>;
  }
  return <Badge variant="secondary">{status ?? "—"}</Badge>;
}

/**
 * One-line plan status under the title. Four visual states encode urgency:
 *   - past_due → red, action-required copy
 *   - cancelAtPeriodEnd → amber, winding-down copy
 *   - active paid subscription → muted, "Renews [date]" (Stripe date)
 *   - free → muted, "Usage resets [Month 1]" (calendar-month reset)
 *
 * The Stripe billing anniversary and the usage-cycle boundary are
 * independent: paid plans see both a Stripe renewal date here and a
 * calendar-month usage reset in the meter below.
 */
function SubscriptionStatusLine({
  plan,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  usageResetsAt,
}: {
  plan: PlanId;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  usageResetsAt: Date;
}) {
  // Payment failed — most urgent, render in red.
  if (status === "past_due") {
    return (
      <p className="text-sm font-medium text-red-700 mt-1">
        Payment failed · Update payment method
      </p>
    );
  }

  // Subscription is winding down at period end — amber.
  if (cancelAtPeriodEnd && currentPeriodEnd) {
    return (
      <p className="text-sm font-medium text-amber-700 mt-1">
        Access until {fmtDate(currentPeriodEnd)} · Cancelled
      </p>
    );
  }

  // Healthy paid subscription — show next renewal date.
  if (
    (status === "active" || status === "trialing") &&
    currentPeriodEnd
  ) {
    return (
      <p className="text-sm text-muted-foreground mt-1">
        Renews {fmtDate(currentPeriodEnd)}
      </p>
    );
  }

  // Free plan — no subscription to renew, so show when the message
  // counter next rolls over instead.
  if (plan === "free") {
    return (
      <p className="text-sm text-muted-foreground mt-1">
        Usage resets {formatResetDate(usageResetsAt)}
      </p>
    );
  }

  return null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { feature?: string };
}) {
  const user = await requireUser();
  const plan = getPlan(user.plan);
  // Snap to the current calendar-month period before we read the
  // counter, so a Free account stuck at last month's number resets
  // to 0 on this page-load rather than requiring a send attempt.
  const rolled = await ensureUsagePeriodCurrent(user.id);
  // ?feature=… set when the user was redirected here by a paid-feature
  // gate. Render an amber upgrade banner above the rest of the page.
  const featureKey = searchParams?.feature ?? "";
  const featureMessage = FEATURE_MESSAGES[featureKey] ?? null;
  const used = rolled?.used ?? user.messagesUsedThisMonth;
  const limit = plan.limits.messagesPerMonth;
  // Two numbers: `percent` is an integer used for the bar width +
  // color-band bucketing; `percentLabel` is the human-readable string
  // for the "% used" text, which shows "<1%" for any non-zero value
  // below one percent so users on huge plans (e.g. Pro's 100k cap)
  // don't see "0% used" when they've actually sent hundreds.
  const rawPercent =
    limit > 0 && Number.isFinite(limit)
      ? Math.min(100, (used / limit) * 100)
      : 0;
  const percent = Math.round(rawPercent);
  const percentLabel =
    rawPercent === 0 ? "0%" : rawPercent < 1 ? "<1%" : `${percent}%`;

  // New-shape plan objects sourced directly from lib/plans.ts. The
  // PlanComparison component handles the monthly/annual toggle and
  // the 4-tier grid; no need to pre-shape here.
  const planCards = getAllPlansOrdered();
  const currentInterval: BillingInterval =
    user.billingInterval === "year" ? "year" : "month";

  // Usage cycle is calendar-month: the 1st of the next month at
  // 00:00 UTC, plan-independent. See lib/usagePeriod.ts.
  const usageResetsAt = firstOfNextMonthUtc();

  // Color the bar based on usage band.
  const bandClass =
    percent >= 90 ? "bg-red-500" : percent >= 75 ? "bg-amber-500" : "bg-whatsapp";

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription, view usage, and upgrade your plan.
        </p>
      </header>

      {featureMessage && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3"
        >
          <Lock className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-amber-900">
              Upgrade required
            </div>
            <div className="text-sm text-amber-900">{featureMessage}</div>
            <div className="text-xs text-amber-800/80">
              Choose a plan below to continue.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Your Plan
            <span className="text-base font-normal text-muted-foreground">
              {plan.name}
              {plan.price > 0 && (
                <>
                  {" "}·{" "}
                  {currentInterval === "year"
                    ? `$${(plan.price * 10).toLocaleString()}/yr`
                    : `$${plan.price}/mo`}
                </>
              )}
            </span>
            {pickStatusBadge(
              plan.id,
              user.stripeSubscriptionStatus,
              user.cancelAtPeriodEnd,
              user.currentPeriodEnd
            )}
          </CardTitle>
          {/* Prominent status line right under the badge. Color encodes state:
              past_due → red (action required), cancelAtPeriodEnd → amber
              (winding down), active → muted (informational). */}
          <SubscriptionStatusLine
            plan={plan.id}
            status={user.stripeSubscriptionStatus}
            cancelAtPeriodEnd={user.cancelAtPeriodEnd}
            currentPeriodEnd={user.currentPeriodEnd}
            usageResetsAt={usageResetsAt}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium">Messages this month</span>
              <span className="text-sm text-muted-foreground">
                {Number.isFinite(limit) ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : `${used.toLocaleString()}`}
              </span>
            </div>
            {/* Visual progress bar — 8px tall on zinc-200, fill recolors at
                75% (amber) and 90% (red). Width = used / limit ratio. */}
            <div
              className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Messages used this month"
            >
              <div
                className={`h-full transition-all ${bandClass}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3">
              <span>{percentLabel} used</span>
              <span>·</span>
              <span>{Math.max(0, limit - used).toLocaleString()} remaining</span>
              <span>·</span>
              <span>Resets {formatResetDate(usageResetsAt)}</span>
            </div>
          </div>

          {/* Manage Subscription only for paid plans with a Stripe
              customer — Free has nothing to manage. */}
          {plan.id !== "free" && user.stripeCustomerId && (
            <div className="pt-2 border-t flex flex-wrap gap-2">
              <PortalButton
                label={
                  user.stripeSubscriptionStatus === "past_due"
                    ? "Update Payment Method"
                    : user.cancelAtPeriodEnd
                    ? "Reactivate Subscription"
                    : "Manage Subscription"
                }
                variant={user.stripeSubscriptionStatus === "past_due" ? "default" : "outline"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          Compare plans
        </h2>
        <PlanComparison
          currentPlan={plan.id}
          currentInterval={currentInterval}
          hasBillingAccount={plan.id !== "free" && Boolean(user.stripeCustomerId)}
          plans={planCards}
        />
      </div>
    </div>
  );
}
