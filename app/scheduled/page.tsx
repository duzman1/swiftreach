"use client";

// Scheduled campaigns dashboard. Shows upcoming + recurring runs with
// per-row Edit / Cancel / Run Now actions. The wizard creates rows here;
// the cron at /api/cron/send-scheduled fires them at scheduledFor.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Repeat, X, Play, Loader2, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ScheduledRow {
  id: string;
  name: string;
  mode: string;
  status: string;
  scheduledFor: string;
  timezone: string;
  recurring: boolean;
  recurrence: string | null;
  recurrenceDay: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-indigo-100 text-indigo-700" },
  running: { label: "Running", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-600" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeRecurrence(r: ScheduledRow): string {
  if (!r.recurring || !r.recurrence) return "One-time";
  if (r.recurrence === "daily") return "Daily";
  if (r.recurrence === "weekly") {
    const day = r.recurrenceDay != null ? WEEKDAYS[r.recurrenceDay] ?? "" : "";
    return day ? `Weekly · ${day}` : "Weekly";
  }
  if (r.recurrence === "monthly") {
    const day = r.recurrenceDay ?? 1;
    return `Monthly · day ${day}`;
  }
  return "Recurring";
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ScheduledPage() {
  const router = useRouter();
  const [list, setList] = useState<ScheduledRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/scheduled");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setList(j.scheduled);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(row: ScheduledRow) {
    if (!confirm(`Cancel "${row.name}"? It will not run again.`)) return;
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/scheduled/${row.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Cancel failed");
      toast.success("Scheduled campaign cancelled");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(row: ScheduledRow) {
    if (!confirm(`Send "${row.name}" right now?`)) return;
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/scheduled/${row.id}/run-now`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Run failed");
      toast.success(`Sending now — opening campaign…`);
      router.push(`/campaigns/${j.campaign.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = (list ?? []).filter(
    (r) => r.status === "scheduled" || r.status === "running"
  );
  const past = (list ?? []).filter(
    (r) => r.status === "completed" || r.status === "cancelled" || r.status === "failed"
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Scheduled Campaigns</h1>
        <p className="text-muted-foreground mt-1">
          Send a campaign at a future time, or set it to repeat automatically.
        </p>
      </header>

      {loading && !list && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Loading…
          </CardContent>
        </Card>
      )}

      {list && upcoming.length === 0 && past.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">No scheduled campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create one from the New Campaign wizard — pick &quot;Schedule for later&quot; in Step 4.
            </p>
            <Button onClick={() => router.push("/send")}>New Campaign</Button>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Upcoming
            </CardTitle>
            <CardDescription>
              Will fire automatically at the scheduled time. Cron runs every minute.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Campaign</th>
                    <th className="px-4 py-3 text-left">Scheduled for</th>
                    <th className="px-4 py-3 text-left">Recurrence</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {upcoming.map((r) => {
                    const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.scheduled;
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3">
                          <div>{fmtWhen(r.scheduledFor)}</div>
                          <div className="text-[11px] text-muted-foreground">{r.timezone}</div>
                        </td>
                        <td className="px-4 py-3">
                          {r.recurring ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Repeat className="w-3 h-3" />
                              {describeRecurrence(r)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">One-time</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runNow(r)}
                              disabled={busyId === r.id || r.status === "running"}
                              className="gap-1"
                            >
                              {busyId === r.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              Run now
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(r)}
                              disabled={busyId === r.id || r.status === "running"}
                              className="text-red-600 hover:text-red-700 gap-1"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> History
            </CardTitle>
            <CardDescription>Completed, failed, or cancelled.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Campaign</th>
                    <th className="px-4 py-3 text-left">Scheduled for</th>
                    <th className="px-4 py-3 text-left">Last run</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {past.map((r) => {
                    const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.completed;
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3">{fmtWhen(r.scheduledFor)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.lastRunAt ? fmtWhen(r.lastRunAt) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
