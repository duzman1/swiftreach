"use client";

// Plan grid on the /billing page. Renders all four tiers (Free,
// Starter, Growth, Pro), a Monthly / Annual toggle, and a comparison
// table sourced from lib/plans.ts so it can never drift from the
// enforcement logic.

import * as React from "react";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getPreviousPlan,
  getLimit,
  isAtOrAbove,
  type PlanId,
  type BillingInterval,
  type Plan,
  type FeatureKey,
} from "@/lib/plans";

interface Props {
  currentPlan: PlanId;
  currentInterval: BillingInterval;
  hasBillingAccount: boolean;
  /** Passed in from the server-rendered billing page — all four
   *  plans in tier order, with the current env's Stripe price ids
   *  already resolved. */
  plans: Plan[];
}

const HIGHLIGHTED: PlanId = "growth";

// Feature rows for the comparison table (bottom of the page).
// Each row's `key` maps 1:1 to a FeatureKey or a limit slot in
// lib/plans.ts.
const FEATURE_ROWS: Array<{
  key:
    | FeatureKey
    | "messagesPerMonth"
    | "whatsappNumbers"
    | "savedTemplates"
    | "campaignHistory"
    | "teamMembers"
    | "supportSla"
    | "inbox"
    | "automations"
    | "apiKeys";
  label: string;
  kind:
    | "feature"
    | "limit-msg"
    | "limit-num"
    | "limit-templates"
    | "limit-history"
    | "limit-team"
    | "limit-automations"
    | "limit-api-keys"
    | "sla"
    | "always-on";
}> = [
  { key: "messagesPerMonth", label: "Messages / month", kind: "limit-msg" },
  { key: "whatsappNumbers", label: "WhatsApp numbers", kind: "limit-num" },
  { key: "savedTemplates", label: "Saved templates", kind: "limit-templates" },
  { key: "campaignHistory", label: "Campaign history", kind: "limit-history" },
  { key: "inbox", label: "Inbox", kind: "always-on" },
  { key: "automations", label: "Automations", kind: "limit-automations" },
  {
    key: "birthdayAutomations",
    label: "Birthday & anniversary messages",
    kind: "feature",
  },
  { key: "apiKeys", label: "API keys", kind: "limit-api-keys" },
  { key: "csvExport", label: "CSV export", kind: "feature" },
  { key: "googleDriveImport", label: "Google Drive import", kind: "feature" },
  { key: "scheduledCampaigns", label: "Scheduled campaigns", kind: "feature" },
  { key: "fullAnalytics", label: "Full analytics", kind: "feature" },
  { key: "analyticsExport", label: "Analytics export", kind: "feature" },
  { key: "savedAudiences", label: "Saved audiences", kind: "feature" },
  { key: "teamMembers", label: "Team members", kind: "limit-team" },
  { key: "whiteLabelReports", label: "White-label reports", kind: "feature" },
  { key: "perClientReporting", label: "Per-client reporting", kind: "feature" },
  { key: "customOnboarding", label: "Custom onboarding", kind: "feature" },
  { key: "supportSla", label: "Support SLA", kind: "sla" },
];

export function PlanComparison({
  currentPlan,
  currentInterval,
  hasBillingAccount,
  plans,
}: Props) {
  const [interval, setInterval] = React.useState<BillingInterval>(
    currentInterval || "month"
  );
  const [busyPlan, setBusyPlan] = React.useState<PlanId | null>(null);
  const [portalBusy, setPortalBusy] = React.useState(false);

  async function upgrade(planId: PlanId) {
    setBusyPlan(planId);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
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

  // Downgrades never create a new checkout session — they must go
  // through the Stripe Customer Portal so Stripe handles proration,
  // period-end scheduling, and the "you keep access until X" copy.
  async function openBillingPortal() {
    setPortalBusy(true);
    try {
      const res = await fetch("/api/billing/create-portal", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Could not open billing portal");
        setPortalBusy(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setPortalBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Monthly / Annual toggle */}
      <div className="flex items-center justify-center gap-3">
        <span
          className={cn(
            "text-sm font-medium",
            interval === "month" ? "text-zinc-900" : "text-zinc-500"
          )}
        >
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setInterval(interval === "month" ? "year" : "month")}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors",
            interval === "year" ? "bg-whatsapp" : "bg-zinc-300"
          )}
          aria-label="Toggle billing interval"
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
              interval === "year" && "translate-x-6"
            )}
          />
        </button>
        <span
          className={cn(
            "text-sm font-medium flex items-center gap-2",
            interval === "year" ? "text-zinc-900" : "text-zinc-500"
          )}
        >
          Annual
          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-normal">
            2 months free
          </span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          // Direction of movement from the user's current plan:
          //   isUpgrade   — this card is above current (Upgrade CTA)
          //   isDowngrade — this card is below current (Downgrade CTA,
          //                 routed through Stripe billing portal)
          const isUpgrade = !isCurrent && isAtOrAbove(p.id, currentPlan);
          const isDowngrade = !isCurrent && !isAtOrAbove(p.id, currentPlan);
          // Suppress "Most popular" if the user is already above the
          // highlighted tier — no point pushing Growth to a Pro user.
          const isHighlighted =
            p.id === HIGHLIGHTED && !isAtOrAbove(currentPlan, HIGHLIGHTED);
          const priceId =
            interval === "year" ? p.stripeAnnualPriceId : p.stripeMonthlyPriceId;
          const priceConfigured = p.id === "free" || !!priceId;
          const price = interval === "year" ? p.annualPrice : p.monthlyPrice;
          const perMonth = interval === "year" ? p.annualPrice / 12 : p.monthlyPrice;

          return (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border bg-white p-6 flex flex-col relative",
                isHighlighted
                  ? "border-whatsapp shadow-lg ring-1 ring-whatsapp/20"
                  : "border-zinc-200"
              )}
            >
              {isHighlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-whatsapp text-white text-[10px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="text-lg font-semibold text-zinc-900">
                {p.name}
              </div>

              {/* Price */}
              <div className="mt-3 min-h-[68px]">
                {p.monthlyPrice === 0 ? (
                  <div>
                    <div className="text-3xl font-bold text-zinc-900">Free</div>
                    <div className="text-xs text-zinc-500 mt-1">Forever</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-zinc-900">
                        ${price.toLocaleString()}
                      </span>
                      <span className="text-sm text-zinc-500">
                        /{interval === "year" ? "yr" : "mo"}
                      </span>
                    </div>
                    {interval === "year" && (
                      <div className="text-xs text-zinc-500 mt-1">
                        ${perMonth.toFixed(0)}/mo billed annually
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Card bullets — same shape for all four cards so users
                  can compare volume, numbers, and inheritance
                  consistently. Messages/month and WhatsApp-numbers
                  come from getLimit() so they never drift from
                  lib/plans.ts. */}
              <ul className="mt-4 space-y-2 text-sm text-zinc-700 flex-1">
                {renderBullets(p).map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="w-4 h-4 text-whatsapp shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {/* CTA — pinned to the bottom of the card via the ul's
                  flex-1 above + this mt-6. All cards share the same
                  Button h-10 (or an h-10 spacer div for the "paid user
                  looking at Free card" case) so bottom edges align.
                  Direction:
                    - isCurrent    → 'Current plan' (disabled)
                    - Free card,
                      user is paid → invisible spacer (downgrade to
                                     free goes through Stripe portal;
                                     see billing.page footer link)
                    - isDowngrade  → 'Downgrade to X', outline styling,
                                     opens Stripe billing portal
                    - isUpgrade    → 'Upgrade to X', primary styling
                                     (unless we suppress highlight),
                                     starts a new checkout session */}
              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current plan
                  </Button>
                ) : p.id === "free" ? (
                  <div className="h-10" aria-hidden="true" />
                ) : !priceConfigured ? (
                  <Button variant="outline" disabled className="w-full">
                    Coming soon
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    onClick={openBillingPortal}
                    disabled={portalBusy || busyPlan !== null}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {portalBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Opening portal…
                      </>
                    ) : (
                      <>Downgrade to {p.name}</>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => upgrade(p.id)}
                    disabled={busyPlan !== null}
                    className="w-full gap-2"
                    variant={isHighlighted ? "default" : "outline"}
                  >
                    {busyPlan === p.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      <>Upgrade to {p.name}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison table (bottom) */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
          <h3 className="text-sm font-semibold text-zinc-900">
            Feature comparison
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">Feature</th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    className={cn(
                      "px-4 py-3 text-center",
                      p.id === HIGHLIGHTED && "bg-whatsapp/5"
                    )}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {FEATURE_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-2.5 text-zinc-700">{row.label}</td>
                  {plans.map((p) => (
                    <td
                      key={p.id}
                      className={cn(
                        "px-4 py-2.5 text-center text-zinc-700",
                        p.id === HIGHLIGHTED && "bg-whatsapp/5"
                      )}
                    >
                      {renderCell(p, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage billing */}
      {hasBillingAccount && (
        <div className="text-center text-sm text-zinc-500">
          Need to update payment method, download invoices, or cancel?{" "}
          <ManageBillingLink />
        </div>
      )}
    </div>
  );
}

// Build the bullet list for one plan card. Same shape for all four:
// messages/month, WhatsApp numbers, "Everything in <previous>" for
// non-Free tiers, then plan-specific highlights, then support SLA.
// All values sourced from lib/plans.ts so they can't drift.
function renderBullets(p: Plan): string[] {
  const bullets: string[] = [];
  const messagesLimit = getLimit(p.id, "messagesPerMonth");
  const numbersLimit = getLimit(p.id, "whatsappNumbers");

  bullets.push(
    `${(messagesLimit ?? 0).toLocaleString()} messages / month`
  );
  bullets.push(
    `${numbersLimit} WhatsApp number${numbersLimit === 1 ? "" : "s"}`
  );

  // "Everything in <previous>" — Starter/Growth/Pro only. Free has no
  // predecessor so getPreviousPlan returns null and we skip.
  const previous = getPreviousPlan(p.id);
  if (previous) {
    bullets.push(`Everything in ${previous.name}`);
  }

  // Plan-specific highlights. Pro leads with the differentiators the
  // spec called out (in Pro's case these follow the inheritance line);
  // lower tiers add whatever features they've enabled.
  if (p.id === "pro") {
    bullets.push("White-label reports");
    bullets.push("Per-client reporting");
    bullets.push("1-hour custom onboarding call");
  } else {
    if (p.features.scheduledCampaigns)
      bullets.push("Scheduled campaigns");
    if (p.features.csvExport && p.features.googleDriveImport) {
      bullets.push("CSV export + Google Drive import");
    } else if (p.features.csvExport) {
      bullets.push("CSV export");
    } else if (p.features.googleDriveImport) {
      bullets.push("Google Drive import");
    }
    if (p.features.fullAnalytics) bullets.push("Full analytics");
    if (p.features.savedAudiences) bullets.push("Saved audiences");
  }

  // Support SLA closes the list — pulled directly from lib/plans.ts
  // so FIX 5's edit ("4-hour priority support") flows through here.
  bullets.push(p.supportSla);

  return bullets;
}

function renderCell(
  p: Plan,
  row: (typeof FEATURE_ROWS)[number]
): React.ReactNode {
  switch (row.kind) {
    case "limit-msg":
      return p.limits.messagesPerMonth.toLocaleString();
    case "limit-num":
      return p.limits.whatsappNumbers;
    case "limit-templates":
      return p.limits.savedTemplates === null
        ? "Unlimited"
        : p.limits.savedTemplates;
    case "limit-history":
      return p.limits.campaignHistory === null
        ? "Full"
        : `Last ${p.limits.campaignHistory}`;
    case "limit-team":
      return p.limits.teamMembers;
    case "limit-automations":
      return p.limits.automations === null
        ? "Unlimited"
        : p.limits.automations;
    case "limit-api-keys":
      return p.limits.apiKeys;
    case "always-on":
      // Rendered as a checkmark on every tier. Used for Inbox — it's
      // available on every plan (opt-out replies must reach every
      // user) so we show ✓ across the row rather than a limit value.
      return <Check className="w-4 h-4 text-emerald-600 mx-auto" />;
    case "sla":
      return p.supportSla;
    case "feature":
      // row.key is guaranteed to be a FeatureKey here
      return p.features[row.key as FeatureKey] ? (
        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
      ) : (
        <X className="w-4 h-4 text-zinc-300 mx-auto" />
      );
  }
}

function ManageBillingLink() {
  const [busy, setBusy] = React.useState(false);
  async function openPortal() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/create-portal", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Could not open billing portal");
        setBusy(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }
  return (
    <button
      onClick={openPortal}
      disabled={busy}
      className="text-whatsapp hover:underline font-medium disabled:opacity-50"
    >
      {busy ? "Opening…" : "Manage billing"}
    </button>
  );
}
