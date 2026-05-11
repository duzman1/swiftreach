"use client";

// Cross-user campaign list. Fetches /api/admin/campaigns so the API is the
// single source of truth — anything you can see in this UI is reproducible
// by curling the API. The route applies no userId filter, so admins always
// see every user's campaigns.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface CampaignRow {
  id: string;
  name: string;
  mode: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

interface Summary {
  totalAllTime: number;
  last30: number;
  messagesSentAllTime: number;
  messagesFailedAllTime: number;
}

interface ListResponse {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  campaigns: CampaignRow[];
  summary: Summary;
  error?: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export default function AdminCampaignsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [status, setStatus] = useState(params.get("status") ?? "");
  const page = parseInt(params.get("page") ?? "1", 10) || 1;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    router.replace(`/admin/campaigns${sp.toString() ? `?${sp.toString()}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams(params.toString());
    fetch(`/api/admin/campaigns?${sp.toString()}`)
      .then((r) => r.json())
      .then((j: ListResponse) => {
        if (cancelled) return;
        if (!j.ok) setErr(j.error ?? "Failed to load campaigns");
        else setData(j);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Network error");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params]);

  function goToPage(n: number) {
    const sp = new URLSearchParams(params.toString());
    sp.set("page", String(n));
    router.replace(`/admin/campaigns?${sp.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data?.summary
            ? `${formatNumber(data.summary.totalAllTime)} total · ${formatNumber(data.summary.last30)} in last 30 days · ${formatNumber(data.summary.messagesSentAllTime)} messages sent all-time`
            : "Loading…"}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Status:</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sending">Sending</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Campaign</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Sent / Total</th>
                <th className="px-4 py-3 text-right">Failed</th>
                <th className="px-4 py-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {err && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-red-600">
                    {err}
                  </td>
                </tr>
              )}
              {data?.campaigns.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No campaigns match these filters
                  </td>
                </tr>
              )}
              {data?.campaigns.map((c) => {
                const ownerName = c.user
                  ? [c.user.firstName, c.user.lastName].filter(Boolean).join(" ")
                  : "";
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      {c.user ? (
                        <Link
                          href={`/admin/users/${c.user.id}`}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          {c.user.email}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">— (orphan)</span>
                      )}
                      {ownerName && (
                        <div className="text-[11px] text-slate-500">{ownerName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.mode}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          STATUS_BADGE[c.status] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.sentCount.toLocaleString()} / {c.totalCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.failedCount > 0 ? (
                        <span className="text-red-600">{c.failedCount.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-xs text-slate-500">
              Page {data.page} of {data.totalPages} · {data.total.toLocaleString()} matching
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= data.totalPages}
                onClick={() => goToPage(page + 1)}
                className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
