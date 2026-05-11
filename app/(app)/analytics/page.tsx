"use client";

// Analytics dashboard. Seven sections: stat cards → funnel → volume line →
// heatmap → top templates → campaign table → opt-outs. Date range applies
// to everything except sections that are inherently all-time (templates).
//
// All data loads in parallel on mount + on range change.

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Send,
  CheckCircle2,
  Eye,
  XCircle,
  BarChart3,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradePrompt } from "@/components/shared/UpgradePrompt";
import { Heatmap } from "@/components/analytics/Heatmap";
import {
  VolumeLineChart,
  OptOutLineChart,
  FunnelChart,
  type FunnelBar,
} from "@/components/analytics/AnalyticsCharts";

type Range = "7d" | "30d" | "90d";

interface Summary {
  range: { start: string; end: string; days: number };
  counts: { sent: number; delivered: number; read: number; failed: number; skipped: number };
  rates: { delivered: number; read: number; failed: number };
}

interface VolumePoint {
  date: string;
  value: number;
}

interface HeatmapCell {
  sent: number;
  read: number;
  rate: number | null;
}
interface HeatmapData {
  grid: HeatmapCell[][];
  best: { dow: number; hr: number; rate: number; sent: number } | null;
}

interface TemplateRow {
  templateId: string | null;
  templateName: string;
  timesUsed: number;
  sent: number;
  read: number;
  readRate: number;
  lastUsedAt: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  mode: string;
  status: string;
  createdAt: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  readRate: number;
  deliveryRate: number;
}

interface OptOuts {
  totalOptedOut: number;
  thisMonth: number;
  inRange: number;
  ratePct: number;
  points: VolumePoint[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtHourRange(h: number): string {
  const ampm = (n: number) => (n === 0 ? "12am" : n === 12 ? "12pm" : n < 12 ? `${n}am` : `${n - 12}pm`);
  return `${ampm(h)}–${ampm((h + 1) % 24)}`;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [volume, setVolume] = useState<VolumePoint[] | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [optouts, setOptouts] = useState<OptOuts | null>(null);

  const [sortKey, setSortKey] = useState<keyof CampaignRow>("readRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `?range=${range}`;
    Promise.all([
      fetch(`/api/analytics/summary${qs}`).then((r) => r.json().then((j) => ({ status: r.status, j }))),
      fetch(`/api/analytics/volume${qs}`).then((r) => r.json()),
      fetch(`/api/analytics/heatmap${qs}`).then((r) => r.json()),
      fetch(`/api/analytics/templates`).then((r) => r.json()),
      fetch(`/api/analytics/campaigns${qs}`).then((r) => r.json()),
      fetch(`/api/analytics/optouts${qs}`).then((r) => r.json()),
    ])
      .then(([s, v, h, t, c, o]) => {
        if (cancelled) return;
        if (s.status === 403 && s.j?.upgradeRequired) {
          setUpgradeRequired(true);
          return;
        }
        if (s.j?.ok) setSummary(s.j);
        if (v?.ok) setVolume(v.points);
        if (h?.ok) setHeatmap({ grid: h.grid, best: h.best });
        if (t?.ok) setTemplates(t.templates);
        if (c?.ok) setCampaigns(c.campaigns);
        if (o?.ok) setOptouts(o);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to load analytics")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (upgradeRequired) {
    return (
      <div className="space-y-6">
        <header className="max-w-5xl">
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Delivery + read rates, best send times, and opt-out tracking.
          </p>
        </header>
        <UpgradePrompt
          feature="Analytics Dashboard"
          description="See real delivery + read rates, find the best hour to send, and track opt-outs over time. All based on real Meta webhook callbacks."
        />
      </div>
    );
  }

  const funnelData: FunnelBar[] = summary
    ? [
        { name: "Sent", value: summary.counts.sent, color: "#94a3b8" },
        { name: "Delivered", value: summary.counts.delivered, color: "#4f46e5" },
        { name: "Read", value: summary.counts.read, color: "#25D366" },
        { name: "Failed", value: summary.counts.failed, color: "#ef4444" },
      ]
    : [];

  const sortedCampaigns: CampaignRow[] = campaigns
    ? [...campaigns].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const as = String(av ?? "");
        const bs = String(bv ?? "");
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      })
    : [];

  function toggleSort(key: keyof CampaignRow) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Delivery + read rates from Meta webhook callbacks. Read engagement
            depends on contacts opening WhatsApp.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border bg-background p-0.5">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                range === r ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Last 90 days"}
            </button>
          ))}
        </div>
      </header>

      {loading && !summary && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-3 w-20 bg-zinc-200 rounded animate-pulse mb-2" />
                <div className="h-8 w-24 bg-zinc-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Section 1 — Stat cards */}
      {summary && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Messages Sent"
            value={summary.counts.sent}
            sub="100%"
            icon={Send}
            tone="default"
          />
          <StatCard
            label="Delivered"
            value={summary.counts.delivered}
            sub={`${summary.rates.delivered}%`}
            icon={CheckCircle2}
            tone="indigo"
          />
          <StatCard
            label="Read"
            value={summary.counts.read}
            sub={`${summary.rates.read}%`}
            icon={Eye}
            tone="success"
          />
          <StatCard
            label="Failed"
            value={summary.counts.failed}
            sub={`${summary.rates.failed}%`}
            icon={XCircle}
            tone="warning"
          />
        </div>
      )}

      {/* Section 2 — Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Funnel</CardTitle>
          <CardDescription>How far each message gets through the pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary && summary.counts.sent > 0 ? (
            <FunnelChart data={funnelData} />
          ) : (
            <EmptyHint icon={BarChart3} label="No messages sent in this window yet." />
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Volume */}
      <Card>
        <CardHeader>
          <CardTitle>Send Volume</CardTitle>
          <CardDescription>Messages sent per day.</CardDescription>
        </CardHeader>
        <CardContent>
          {volume && volume.some((p) => p.value > 0) ? (
            <VolumeLineChart data={volume} />
          ) : (
            <EmptyHint icon={Clock} label="No sends in this date range." />
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Best Time to Send</CardTitle>
          <CardDescription>
            Read rate by weekday × hour (UTC). Cells with fewer than 3 sends are
            ignored when picking the best window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {heatmap ? (
            <>
              <Heatmap grid={heatmap.grid} />
              {heatmap.best && (
                <div className="text-sm rounded-md border bg-emerald-50 border-emerald-200 px-4 py-3 text-emerald-900">
                  💡 Your messages get read most on{" "}
                  <strong>{WEEKDAYS[heatmap.best.dow]}</strong> between{" "}
                  <strong>{fmtHourRange(heatmap.best.hr)}</strong> ({heatmap.best.rate}% read rate
                  over {heatmap.best.sent} sends in this window).
                </div>
              )}
              {!heatmap.best && (
                <p className="text-sm text-muted-foreground">
                  Not enough data yet — keep sending. We need at least 3 sends in
                  one hour bucket to call it a winner.
                </p>
              )}
            </>
          ) : (
            <EmptyHint icon={Clock} label="Loading heatmap…" />
          )}
        </CardContent>
      </Card>

      {/* Section 5 — Top templates */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Templates</CardTitle>
          <CardDescription>All-time, ranked by read rate.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {templates && templates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Template</th>
                    <th className="px-4 py-3 text-right">Times Used</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Read Rate</th>
                    <th className="px-4 py-3 text-right">Last Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {templates.map((t) => (
                    <tr key={t.templateName} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium">{t.templateName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.timesUsed}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.sent}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {t.sent === 0 ? "—" : `${t.readRate}%`}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">
              No templates yet. Save a freeform message as a template to see it here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 6 — Campaign performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
          <CardDescription>Click a header to sort. Click a row to view details.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sortedCampaigns.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">
              No campaigns in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {[
                      ["name", "Campaign"],
                      ["createdAt", "Date"],
                      ["sent", "Sent"],
                      ["delivered", "Delivered"],
                      ["read", "Read"],
                      ["readRate", "Read Rate"],
                      ["failed", "Failed"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key as keyof CampaignRow)}
                        className="px-4 py-3 text-left cursor-pointer hover:text-foreground select-none"
                      >
                        {label}
                        {sortKey === key && (
                          <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="text-whatsapp hover:underline font-medium"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{c.sent.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums">{c.delivered.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums">{c.read.toLocaleString()}</td>
                      <td className="px-4 py-2 tabular-nums font-medium">
                        {c.sent === 0 ? "—" : `${c.readRate}%`}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {c.failed > 0 ? (
                          <span className="text-red-600">{c.failed.toLocaleString()}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 7 — Opt-outs */}
      <Card>
        <CardHeader>
          <CardTitle>Opt-Out Tracking</CardTitle>
          <CardDescription>
            Contacts who sent STOP, UNSUBSCRIBE, or similar. Compliance signal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {optouts ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border bg-zinc-50 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Total opted out</div>
                  <div className="text-2xl font-semibold tabular-nums">{optouts.totalOptedOut}</div>
                </div>
                <div className="rounded-md border bg-zinc-50 px-3 py-2">
                  <div className="text-xs text-muted-foreground">This month</div>
                  <div className="text-2xl font-semibold tabular-nums">{optouts.thisMonth}</div>
                </div>
                <div className="rounded-md border bg-zinc-50 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Rate (range)</div>
                  <div className="text-2xl font-semibold tabular-nums">{optouts.ratePct}%</div>
                </div>
              </div>
              {optouts.points.some((p) => p.value > 0) ? (
                <OptOutLineChart data={optouts.points} />
              ) : (
                <EmptyHint icon={AlertTriangle} label="No opt-outs in this window. 🎉" />
              )}
            </>
          ) : (
            <EmptyHint icon={Clock} label="Loading…" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  icon: LucideIcon;
  tone: "default" | "indigo" | "success" | "warning";
}) {
  const tones: Record<typeof tone, string> = {
    default: "text-zinc-500 bg-zinc-50",
    indigo: "text-indigo-600 bg-indigo-50",
    success: "text-emerald-600 bg-emerald-50",
    warning: "text-red-600 bg-red-50",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500 font-medium">{label}</div>
          <div className={`p-1.5 rounded ${tones[tone]}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <div className="text-sm">{label}</div>
    </div>
  );
}
