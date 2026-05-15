"use client";

// Live feed of webhook API traffic for the admin dashboard. Polls
// /api/admin/api-usage every 15s. Renders two side-by-side panels:
//   - Top users in the last 24h (volume leaders)
//   - Recent log entries (live stream, last ~50)
//
// We intentionally keep this read-only — admin observability is the
// only goal. Errors are surfaced inline so a transient hiccup doesn't
// hide the rest of the dashboard.

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface TopUser {
  userId: string;
  email: string;
  plan: string;
  requests: number;
}

interface LogRow {
  id: string;
  createdAt: string;
  userId: string;
  email: string;
  keyName: string;
  keyPrefix: string;
  phoneNumber: string;
  messageType: string;
  templateName: string | null;
  status: string;
  errorMessage: string | null;
  responseTimeMs: number | null;
}

interface ApiUsageResponse {
  ok: boolean;
  topUsers: TopUser[];
  recentLogs: LogRow[];
  error?: string;
}

const POLL_MS = 15_000;

export function ApiUsageFeed() {
  const [data, setData] = React.useState<ApiUsageResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/api-usage", { cache: "no-store" });
      const json: ApiUsageResponse = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading live feed…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Failed to load API usage data: {error ?? "unknown error"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top users */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">
            Top users (24h)
          </div>
          {data.topUsers.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              No API requests yet
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topUsers.map((u) => (
                <li
                  key={u.userId}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <a
                    href={`/admin/users/${u.userId}`}
                    className="text-indigo-600 hover:underline truncate"
                  >
                    {u.email}
                  </a>
                  <span className="text-xs text-slate-500 ml-2 shrink-0">
                    {u.plan} · {u.requests} req
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Live log feed */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Recent webhook requests
            </div>
            <div className="text-xs text-slate-400">
              Polling every {POLL_MS / 1000}s
            </div>
          </div>
          {data.recentLogs.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              No webhook traffic yet
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={`/admin/users/${l.userId}`}
                          className="text-indigo-600 hover:underline text-xs truncate max-w-[160px] inline-block align-middle"
                          title={l.email}
                        >
                          {l.email}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-700 whitespace-nowrap">
                        {l.phoneNumber}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {l.messageType === "template" && l.templateName
                          ? `template: ${l.templateName}`
                          : l.messageType}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={l.status} message={l.errorMessage} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 text-right tabular-nums">
                        {l.responseTimeMs != null ? `${l.responseTimeMs}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  message,
}: {
  status: string;
  message: string | null;
}) {
  const tones: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    rate_limited: "bg-amber-50 text-amber-700 border-amber-200",
    invalid: "bg-slate-100 text-slate-700 border-slate-200",
  };
  const tone = tones[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      title={message ?? undefined}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}
