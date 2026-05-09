// Billing management page. Shows the user's current plan, this period's
// usage, and the plan comparison grid for upgrades. Cancellations,
// downgrades, payment-method updates all go through the Stripe Customer
// Portal — opened by the "Manage Subscription" button.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { PLANS, getPlan, type PlanId } from "@/lib/stripe";
import { PlanComparison } from "@/components/billing/PlanComparison";
import { PortalButton } from "@/components/billing/PortalButton";

export const dynamic = "force-dynamic";

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

export default async function BillingPage() {
  const user = await requireUser();
  const plan = getPlan(user.plan);
  const used = user.messagesUsedThisMonth;
  const limit = plan.limits.messagesPerMonth;
  const percent = limit > 0 && Number.isFinite(limit) ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const planCards = (Object.values(PLANS) as Array<(typeof PLANS)[PlanId]>).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    features: p.features,
    limits: {
      messagesPerMonth: p.limits.messagesPerMonth,
      templates: p.limits.templates,
      campaignHistory: p.limits.campaignHistory,
      csvExport: p.limits.csvExport,
      googleDrive: p.limits.googleDrive,
      teamMembers: p.limits.teamMembers,
    },
    priceConfigured: p.id === "free" || Boolean(p.priceId),
  }));

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Your Plan
            <span className="text-base font-normal text-muted-foreground">
              {plan.name}{" "}
              {plan.price > 0 && <span>· ${plan.price}/mo</span>}
            </span>
            {pickStatusBadge(
              plan.id,
              user.stripeSubscriptionStatus,
              user.cancelAtPeriodEnd,
              user.currentPeriodEnd
            )}
          </CardTitle>
          <CardDescription>
            {user.cancelAtPeriodEnd && user.currentPeriodEnd
              ? `Access until ${fmtDate(user.currentPeriodEnd)}.`
              : user.stripeSubscriptionStatus === "active" && user.currentPeriodEnd
              ? `Renews on ${fmtDate(user.currentPeriodEnd)}.`
              : user.stripeSubscriptionStatus === "past_due"
              ? "Your last payment failed. Update your card to keep sending."
              : plan.id === "free"
              ? "You're on the free plan."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium">Messages this month</span>
              <span className="text-sm text-muted-foreground">
                {Number.isFinite(limit) ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : `${used.toLocaleString()}`}
              </span>
            </div>
            <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${bandClass}`} style={{ width: `${percent}%` }} />
            </div>
            <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3">
              <span>{percent}% used</span>
              <span>·</span>
              <span>{Math.max(0, limit - used).toLocaleString()} remaining</span>
              {user.currentPeriodEnd && (
                <>
                  <span>·</span>
                  <span>Resets {fmtDate(user.currentPeriodEnd)}</span>
                </>
              )}
            </div>
          </div>

          {user.stripeCustomerId && (
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
          hasBillingAccount={Boolean(user.stripeCustomerId)}
          plans={planCards}
        />
      </div>
    </div>
  );
}
