"use client";

// Recent errors list with a clear-all button. Stack traces are folded into
// a <details> so the page isn't a wall of text.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorRow {
  id: string;
  route: string;
  message: string;
  stack: string | null;
  userId: string | null;
  severity: string;
  createdAt: string;
}

export function ErrorLogViewer() {
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"" | "error" | "warning">("");
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const sp = filter ? `?severity=${filter}` : "";
      const r = await fetch(`/api/admin/system/errors${sp}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setErrors(j.errors);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load errors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function clearAll() {
    if (!confirm("Delete ALL error logs? This is irreversible.")) return;
    setClearing(true);
    try {
      const r = await fetch("/api/admin/system/errors", { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to clear");
      toast.success(`Cleared ${j.deleted} error(s)`);
      setErrors([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm font-semibold text-slate-900">
          Recent errors {errors && `(${errors.length})`}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "" | "error" | "warning")}
            className="h-8 text-xs rounded-md border border-slate-200 px-2 bg-white"
          >
            <option value="">All severities</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearAll}
            disabled={clearing || !errors || errors.length === 0}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        </div>
      </div>

      {!errors && (
        <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
      )}
      {errors && errors.length === 0 && (
        <div className="text-sm text-slate-400 py-12 text-center">
          No errors logged
        </div>
      )}

      {errors && errors.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {errors.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] uppercase rounded ${
                      e.severity === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {e.severity}
                  </span>
                  <span className="font-mono">{e.route}</span>
                  {e.userId && (
                    <a
                      href={`/admin/users/${e.userId}`}
                      className="text-indigo-600 hover:underline"
                    >
                      → user
                    </a>
                  )}
                </div>
                <span>{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm text-slate-800">{e.message}</div>
              {e.stack && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                    Stack trace
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 overflow-x-auto">
                    {e.stack}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
