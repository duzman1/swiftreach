"use client";

// Live-loaded health checks for /admin/system. The endpoint pings DB +
// Stripe and returns a list of {service, ok, ms} rows.

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, RefreshCw } from "lucide-react";

interface HealthCheck {
  service: string;
  ok: boolean;
  configured: boolean;
  detail?: string;
  ms?: number;
}

export function SystemHealth() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/system/health");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Health check failed");
      setChecks(j.checks);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-slate-900">Health</div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {err && (
        <div className="text-sm text-red-600 px-2 py-3">{err}</div>
      )}

      {!checks && !err && (
        <div className="text-sm text-slate-400 py-3 text-center">Loading…</div>
      )}

      {checks && (
        <ul className="divide-y divide-slate-100">
          {checks.map((c) => {
            const Icon = !c.configured ? MinusCircle : c.ok ? CheckCircle2 : XCircle;
            const color = !c.configured
              ? "text-slate-400"
              : c.ok
              ? "text-emerald-500"
              : "text-red-500";
            return (
              <li key={c.service} className="py-2.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                  <span className="text-sm text-slate-800">{c.service}</span>
                </div>
                <div className="text-xs text-slate-500 truncate text-right">
                  {c.detail && <span className="text-slate-500">{c.detail}</span>}
                  {typeof c.ms === "number" && (
                    <span className="ml-2 text-slate-400 tabular-nums">{c.ms}ms</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
