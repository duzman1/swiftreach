"use client";

// Tabbed body for /admin/users/[id]. Account / Billing / Campaigns /
// Activity Log. Lazy-loads the activity payload (campaigns + errors) on
// first switch to those tabs, so opening the page is fast.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PLANS } from "@/lib/stripe";
import { Button } from "@/components/ui/button";

interface SafeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  messagesUsedThisMonth: number;
  usagePeriodStart: string;
  suspended: boolean;
  whatsappConnected: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappApiVersion: string;
  defaultCountryCode: string;
  defaultDelayMs: number;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityCampaign {
  id: string;
  name: string;
  status: string;
  mode: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

interface ActivityError {
  id: string;
  route: string;
  message: string;
  severity: string;
  createdAt: string;
}

const TABS = ["Account", "Billing", "Campaigns", "Activity Log"] as const;
type Tab = (typeof TABS)[number];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function fmtDateOnly(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function UserDetailTabs({ user }: { user: SafeUser }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Account");
  const [campaigns, setCampaigns] = useState<ActivityCampaign[] | null>(null);
  const [errors, setErrors] = useState<ActivityError[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (tab !== "Campaigns" && tab !== "Activity Log") return;
    if (campaigns !== null && errors !== null) return;
    setActivityLoading(true);
    fetch(`/api/admin/users/${user.id}/activity`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setCampaigns(j.campaigns);
          setErrors(j.errors);
        } else {
          toast.error(j.error ?? "Failed to load activity");
        }
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Network error")
      )
      .finally(() => setActivityLoading(false));
  }, [tab, user.id, campaigns, errors]);

  async function changePlan(newPlan: string) {
    if (newPlan === user.plan) return;
    if (!confirm(`Change plan from ${user.plan} → ${newPlan}? This is a manual override and does NOT touch Stripe.`)) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(`Plan set to ${newPlan}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function toggleSuspend() {
    const next = !user.suspended;
    if (!confirm(next ? "Suspend this user? Their sends will be blocked until you unsuspend." : "Unsuspend this user?")) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: next }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(next ? "User suspended" : "User unsuspended");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function deleteUser() {
    const confirmText = `delete ${user.email}`;
    const typed = prompt(
      `This will CANCEL the user's Stripe subscription (if any) and PERMANENTLY DELETE their account, campaigns, and templates.\n\nType '${confirmText}' to confirm.`
    );
    if (typed !== confirmText) {
      toast.message("Delete cancelled");
      return;
    }
    setActing(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("User deleted");
      router.push("/admin/users");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab strip */}
      <div className="border-b border-slate-200 flex gap-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Account" && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card title="Identity">
            <Row label="Email" value={user.email} />
            <Row label="Name" value={[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"} />
            <Row label="Joined" value={fmtDate(user.createdAt)} />
            <Row label="Onboarded" value={fmtDate(user.onboardingCompletedAt)} />
          </Card>

          <Card title="WhatsApp connection">
            <Row label="Connected" value={user.whatsappConnected ? "Yes" : "No"} />
            <Row label="Phone Number ID" value={user.whatsappPhoneNumberId || "—"} />
            <Row label="WABA ID" value={user.whatsappBusinessAccountId || "—"} />
            <Row label="API version" value={user.whatsappApiVersion} />
            <Row label="Default country code" value={`+${user.defaultCountryCode}`} />
            <Row label="Default delay" value={`${user.defaultDelayMs} ms`} />
            <p className="text-xs text-slate-400 mt-3">
              The decrypted API token is never shown in the admin panel.
            </p>
          </Card>

          <Card title="Actions" className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={user.suspended ? "default" : "outline"}
                onClick={toggleSuspend}
                disabled={acting}
              >
                {user.suspended ? "Unsuspend" : "Suspend"}
              </Button>
              <Button
                variant="destructive"
                onClick={deleteUser}
                disabled={acting}
              >
                Delete account
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Delete cancels the Stripe subscription FIRST, then removes the user
              row plus all of their campaigns and templates (cascade).
            </p>
          </Card>
        </div>
      )}

      {tab === "Billing" && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card title="Current plan">
            <Row label="Plan" value={user.plan} />
            <Row
              label="Status"
              value={user.stripeSubscriptionStatus ?? "—"}
            />
            <Row
              label="Renews / ends"
              value={fmtDateOnly(user.currentPeriodEnd)}
            />
            <Row
              label="Cancels at period end"
              value={user.cancelAtPeriodEnd ? "Yes" : "No"}
            />
            <Row label="Stripe customer" value={user.stripeCustomerId || "—"} />
            <Row label="Stripe subscription" value={user.stripeSubscriptionId || "—"} />
          </Card>

          <Card title="Usage this period">
            <Row
              label="Messages used"
              value={user.messagesUsedThisMonth.toLocaleString()}
            />
            <Row
              label="Plan limit"
              value={
                PLANS[user.plan as keyof typeof PLANS]?.limits.messagesPerMonth.toLocaleString() ??
                "—"
              }
            />
            <Row label="Period started" value={fmtDateOnly(user.usagePeriodStart)} />
          </Card>

          <Card title="Manual plan override" className="lg:col-span-2">
            <p className="text-xs text-slate-500 mb-3">
              Sets the local plan field only — does NOT create or modify a Stripe
              subscription. Use for comp plans, demos, refunds.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PLANS).map((p) => (
                <Button
                  key={p}
                  variant={user.plan === p ? "default" : "outline"}
                  onClick={() => changePlan(p)}
                  disabled={acting}
                >
                  Set to {p}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "Campaigns" && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {activityLoading && !campaigns ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400 text-sm">
              No campaigns yet
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Sent / Total</th>
                  <th className="px-4 py-3 text-right">Failed</th>
                  <th className="px-4 py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-slate-800">{c.name}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{c.mode}</td>
                    <td className="px-4 py-2 text-slate-700 text-xs">{c.status}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.sentCount.toLocaleString()} / {c.totalCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">
                      {c.failedCount > 0 ? c.failedCount.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Activity Log" && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {activityLoading && !errors ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</div>
          ) : !errors || errors.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400 text-sm">
              No errors logged for this user
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {errors.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono">{e.route}</span>
                    <span>{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-800">{e.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="text-sm font-semibold text-slate-900 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 text-right break-all">{value}</span>
    </div>
  );
}
