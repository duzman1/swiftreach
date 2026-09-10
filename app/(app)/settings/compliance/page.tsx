"use client";

// Compliance dashboard. Every number on this page is a live query
// (per the governing rules) — no placeholders. Available on every
// plan including Free, no feature gate.

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, ShieldCheck, ShieldOff, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Summary {
  windowDays: number;
  consent: {
    total: number;
    explicit: number;
    imported: number;
    unknown: number;
  };
  doNotContact: {
    listSize: number;
    contactsFlaggedOptedOut: number;
  };
  suppressionsWindow: {
    total: number;
    byReason: Record<string, number>;
    bySurface: Record<string, number>;
  };
}

interface DncRow {
  id: string;
  phoneNumber: string;
  reason: string;
  createdAt: string;
  sourceOptOutId: string | null;
}

export default function CompliancePage() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dnc, setDnc] = React.useState<DncRow[] | null>(null);
  const [dncLoading, setDncLoading] = React.useState(false);
  const [dncCursor, setDncCursor] = React.useState<string | null>(null);
  const [clearingPhone, setClearingPhone] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/compliance/summary");
        const j = await r.json();
        if (!j.ok) throw new Error(j.error ?? "Failed");
        setSummary(j);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadDnc(after: string | null = null) {
    setDncLoading(true);
    try {
      const q = after ? `?after=${encodeURIComponent(after)}` : "";
      const r = await fetch(`/api/compliance/dnc${q}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setDnc((prev) => (after ? [...(prev ?? []), ...j.rows] : j.rows));
      setDncCursor(j.nextCursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load DNC");
    } finally {
      setDncLoading(false);
    }
  }

  async function clearDnc(phone: string) {
    if (!confirm(`Remove ${phone} from the do-not-contact list? Future messages to this number will send. Only do this if the contact has re-consented.`)) return;
    setClearingPhone(phone);
    try {
      const r = await fetch("/api/compliance/dnc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Removed from DNC list");
      setDnc((prev) => prev?.filter((r) => r.phoneNumber !== phone) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setClearingPhone(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
        <p className="text-muted-foreground mt-1">
          Consent provenance, opt-out enforcement, and the audit trail proving
          STOPs are honoured. Available on every plan.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !summary ? (
        <div className="text-sm text-red-600">Failed to load compliance data.</div>
      ) : (
        <>
          {/* Consent breakdown. If unknown &gt; 0 the pill is amber — a
              nudge, not a block. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Consent provenance</CardTitle>
              <CardDescription>
                Where each contact&apos;s consent to messaging came from. Recorded
                at capture time — never inferred. See{" "}
                <Link href="/contacts" className="underline">
                  Contacts
                </Link>{" "}
                to promote a contact&apos;s status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Metric label="Total contacts" value={summary.consent.total} />
                <Metric label="Explicit" value={summary.consent.explicit} tone="good" />
                <Metric label="Imported" value={summary.consent.imported} tone="neutral" />
                <Metric label="Unverified" value={summary.consent.unknown} tone={summary.consent.unknown > 0 ? "warn" : "neutral"} />
              </div>
              {summary.consent.unknown > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>{summary.consent.unknown.toLocaleString()} contact
                    {summary.consent.unknown === 1 ? " has" : "s have"} unverified consent.</strong>
                    {" "}Sends are still allowed. To fix, open each contact and set the
                    consent basis, or attach a source when re-importing.
                    {" "}
                    <Link
                      href="/contacts"
                      className="underline font-medium"
                    >
                      Review contacts →
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Opt-outs & DNC list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Do-not-contact list</CardTitle>
              <CardDescription>
                Phone numbers that have opted out. Persistent — survives contact
                deletion + re-import, so a re-uploaded CSV won&apos;t accidentally
                message someone who said STOP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Metric
                  label="DNC list size"
                  value={summary.doNotContact.listSize}
                  tone={summary.doNotContact.listSize > 0 ? "warn" : "neutral"}
                />
                <Metric
                  label="Contacts flagged opted-out"
                  value={summary.doNotContact.contactsFlaggedOptedOut}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadDnc()}
                  disabled={dncLoading}
                  className="gap-1.5"
                >
                  {dncLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  View list
                </Button>
                <a
                  href="/api/compliance/dnc?format=csv"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-zinc-50"
                  download
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </a>
              </div>

              {dnc && (
                <div className="mt-4 rounded-md border border-zinc-200 bg-white overflow-hidden">
                  {dnc.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No entries — no one has opted out yet.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Phone</th>
                          <th className="text-left px-3 py-2 font-medium">Reason</th>
                          <th className="text-left px-3 py-2 font-medium">Added</th>
                          <th className="text-right px-3 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {dnc.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 font-mono">+{r.phoneNumber}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.reason}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {new Date(r.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => clearDnc(r.phoneNumber)}
                                disabled={clearingPhone === r.phoneNumber}
                                title="Remove from DNC list"
                                className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
                              >
                                {clearingPhone === r.phoneNumber ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {dncCursor && (
                    <div className="p-2 border-t bg-zinc-50 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadDnc(dncCursor)}
                        disabled={dncLoading}
                      >
                        Load more
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suppression audit — proof STOPs were honoured */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Suppressions honoured — last {summary.windowDays} days
              </CardTitle>
              <CardDescription>
                Every send SwiftReach refused to dispatch. This is your audit
                trail — if a regulator or platform ever asks &ldquo;did you
                honour their STOP?&rdquo;, the answer is here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Metric
                  label="Total suppressed"
                  value={summary.suppressionsWindow.total}
                  tone={summary.suppressionsWindow.total > 0 ? "good" : "neutral"}
                />
                <div className="col-span-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    By reason
                  </div>
                  <ReasonList data={summary.suppressionsWindow.byReason} />
                </div>
                <div className="col-span-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    By surface
                  </div>
                  <ReasonList data={summary.suppressionsWindow.bySurface} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template + quality — placeholder until Part 3 lands */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Meta template + quality status</CardTitle>
              <CardDescription className="text-xs">
                Coming in the next commit — pulls template approval state and
                phone-number quality rating from Meta so degraded templates
                get flagged before campaign build, not at send time.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-zinc-900";
  const icon =
    tone === "good" ? (
      <ShieldCheck className="w-4 h-4 text-emerald-600" />
    ) : tone === "warn" ? (
      <ShieldOff className="w-4 h-4 text-amber-600" />
    ) : null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function ReasonList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground">None</div>;
  }
  return (
    <ul className="text-sm space-y-1">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between">
          <span className="text-muted-foreground">{humanize(k)}</span>
          <span className="font-medium">{v.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function humanize(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
