"use client";

import * as React from "react";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/lib/stripe";

interface PlanCard {
  id: PlanId;
  name: string;
  price: number;
  features: string[];
  limits: {
    messagesPerMonth: number;
    templates: number;
    campaignHistory: number;
    csvExport: boolean;
    googleDrive: boolean;
    teamMembers: number;
  };
  // Some plans may have no priceId in test envs — disable upgrade for those.
  priceConfigured: boolean;
}

interface Props {
  currentPlan: PlanId;
  hasBillingAccount: boolean;
  plans: PlanCard[];
}

export function PlanComparison({ currentPlan, hasBillingAccount, plans }: Props) {
  const [busyPlan, setBusyPlan] = React.useState<PlanId | null>(null);

  async function upgrade(plan: PlanId) {
    setBusyPlan(plan);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!data.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout");
        setBusyPlan(null);
        return;
      }
      window.location.href = data.url; // Stripe Checkout
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusyPlan(null);
    }
  }

  // For downgrade or cancellation, use the Stripe Customer Portal — Stripe
  // handles proration, payment-method updates, and cancellation flows.
  async function openPortal() {
    setBusyPlan("free"); // any value just to disable buttons
    try {
      const res = await fetch("/api/billing/create-portal", { method: "POST" });
      const data = await res.json();
      if (!data.ok || !data.url) {
        toast.error(data.error ?? "Could not open billing portal");
        setBusyPlan(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusyPlan(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlan;
        const isUpgrade = orderOf(plan.id) > orderOf(currentPlan);
        const isDowngrade = orderOf(plan.id) < orderOf(currentPlan);

        return (
          <div
            key={plan.id}
            className={cn(
              "rounded-lg border bg-card p-5 flex flex-col",
              isCurrent ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-zinc-200"
            )}
          >
            <div className="flex items-baseline justify-between mb-1">
              <div className="font-semibold uppercase tracking-wide text-xs text-muted-foreground">
                {plan.name}
              </div>
              {isCurrent && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Current Plan
                </span>
              )}
            </div>
            <div className="text-3xl font-bold tracking-tight">
              ${plan.price}
              <span className="text-base font-normal text-muted-foreground">
                /mo
              </span>
            </div>

            <ul className="mt-4 space-y-2 text-sm flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
              {!plan.limits.csvExport && (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <X className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>No CSV export</span>
                </li>
              )}
              {!plan.limits.googleDrive && (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <X className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>No Google Drive import</span>
                </li>
              )}
            </ul>

            <div className="mt-5 pt-4 border-t">
              {isCurrent && plan.id === "free" && (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              )}
              {isCurrent && plan.id !== "free" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={openPortal}
                  disabled={busyPlan !== null}
                >
                  Manage Subscription
                </Button>
              )}
              {!isCurrent && isUpgrade && plan.priceConfigured && (
                <Button
                  className="w-full gap-2"
                  onClick={() => upgrade(plan.id)}
                  disabled={busyPlan !== null}
                >
                  {busyPlan === plan.id && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Upgrade to {plan.name} →
                </Button>
              )}
              {!isCurrent && isUpgrade && !plan.priceConfigured && (
                <Button variant="outline" className="w-full" disabled title="Stripe Price ID not set in env">
                  Not configured
                </Button>
              )}
              {!isCurrent && isDowngrade && hasBillingAccount && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={openPortal}
                  disabled={busyPlan !== null}
                >
                  Downgrade in Stripe Portal
                </Button>
              )}
              {!isCurrent && isDowngrade && !hasBillingAccount && (
                <Button variant="outline" className="w-full" disabled>
                  —
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Order plans for upgrade/downgrade comparison.
function orderOf(plan: PlanId): number {
  return { free: 0, starter: 1, growth: 2 }[plan] ?? 0;
}
