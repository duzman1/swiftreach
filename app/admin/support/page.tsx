"use client";

// Admin support triage. Counts at the top, filterable table, click a
// row to open the detail modal where you can mark in-progress / resolved
// or add internal notes. Reply-via-email is a mailto: link so the
// admin's normal email client takes over (signed sender, threaded
// reply, etc.) — no need to build an in-app email composer.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface UserRef {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  plan?: string;
}

interface RequestRow {
  id: string;
  reference: string;
  category: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  user: UserRef | null;
}

interface RequestDetail extends RequestRow {
  message: string;
  adminNotes: string | null;
  resolvedAt: string | null;
  user: UserRef | null;
}

interface ListResponse {
  ok: boolean;
  page: number;
  totalPages: number;
  total: number;
  requests: RequestRow[];
  counts: { open: number; in_progress: number; resolved: number; closed: number };
  error?: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  normal: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const PRIORITY_EMOJI: Record<string, string> = {
  low: "🟢",
  normal: "🟡",
  high: "🟠",
  urgent: "🔴",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

export default function AdminSupportPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set("status", statusFilter);
      if (priorityFilter) sp.set("priority", priorityFilter);
      if (q) sp.set("q", q);
      const r = await fetch(`/api/admin/support?${sp.toString()}`);
      const j: ListResponse = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed to load");
      setData(j);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Support Requests
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {data ? `${data.total.toLocaleString()} total` : "Loading…"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <CountChip label="Open" value={data.counts.open} tone="blue" />
          <CountChip label="In Progress" value={data.counts.in_progress} tone="amber" />
          <CountChip label="Resolved" value={data.counts.resolved} tone="emerald" />
          <CountChip label="Closed" value={data.counts.closed} tone="slate" />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">All priorities</option>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="normal">🟡 Normal</option>
            <option value="low">🟢 Low</option>
          </select>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, reference, email"
            className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Subject / Category</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              )}
              {err && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                    {err}
                  </td>
                </tr>
              )}
              {data?.requests.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No support requests match these filters.
                  </td>
                </tr>
              )}
              {data?.requests.map((r) => {
                const ownerName = r.user
                  ? [r.user.firstName, r.user.lastName].filter(Boolean).join(" ")
                  : "—";
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setOpenId(r.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                    <td className="px-4 py-3">
                      {r.user ? (
                        <Link
                          href={`/admin/users/${r.user.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          {r.user.email}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                      <div className="text-[11px] text-slate-500">{ownerName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.subject}</div>
                      <div className="text-[11px] text-slate-500">{r.category}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded-full ${
                          PRIORITY_BADGE[r.priority] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {PRIORITY_EMOJI[r.priority] ?? ""} {r.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded-full ${
                          STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openId && (
        <SupportDetailModal
          requestId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "emerald" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  } as const;
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

// ── Detail modal ────────────────────────────────────────────────────────

function SupportDetailModal({
  requestId,
  onClose,
  onChanged,
}: {
  requestId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/support/${requestId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setDetail(j.request);
          setNotes(j.request.adminNotes ?? "");
        } else {
          toast.error(j.error ?? "Failed to load request");
        }
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Network error")
      )
      .finally(() => setLoading(false));
  }, [requestId]);

  async function update(patch: { status?: string; adminNotes?: string | null }) {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/support/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Updated");
      onChanged();
      // Re-fetch to refresh local detail.
      const r2 = await fetch(`/api/admin/support/${requestId}`);
      const j2 = await r2.json();
      if (j2.ok) setDetail(j2.request);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 my-10 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            {detail ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">
                  {detail.subject}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-mono">{detail.reference}</span> · {detail.category}
                </p>
              </>
            ) : (
              <h3 className="text-lg font-semibold text-slate-500">Loading…</h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {loading && !detail && (
          <div className="py-8 text-center text-sm text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Loading…
          </div>
        )}

        {detail && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  From
                </div>
                <div className="font-medium text-slate-900 mt-0.5 truncate">
                  {detail.user?.email ?? "—"}
                </div>
                {detail.user && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {[detail.user.firstName, detail.user.lastName]
                      .filter(Boolean)
                      .join(" ") || "—"}
                    {detail.user.plan && (
                      <> · {detail.user.plan.toUpperCase()}</>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Submitted
                </div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {new Date(detail.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-block px-2 py-0.5 uppercase rounded-full ${
                  PRIORITY_BADGE[detail.priority] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {PRIORITY_EMOJI[detail.priority]} {detail.priority}
              </span>
              <span
                className={`inline-block px-2 py-0.5 uppercase rounded-full ${
                  STATUS_BADGE[detail.status] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {detail.status.replace("_", " ")}
              </span>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Message
              </div>
              <div className="rounded-md bg-slate-50 border-l-4 border-whatsapp px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                {detail.message}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 mb-1 block">
                Admin Notes (internal)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Notes for the team — not visible to the customer."
              />
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update({ adminNotes: notes })}
                  disabled={saving}
                >
                  Save Notes
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
              {detail.status !== "in_progress" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update({ status: "in_progress" })}
                  disabled={saving}
                >
                  Mark In Progress
                </Button>
              )}
              {detail.status !== "resolved" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update({ status: "resolved" })}
                  disabled={saving}
                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  Mark Resolved
                </Button>
              )}
              {detail.status !== "closed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update({ status: "closed" })}
                  disabled={saving}
                  className="text-slate-600"
                >
                  Close
                </Button>
              )}
              {detail.user?.email && (
                <a
                  href={`mailto:${detail.user.email}?subject=Re: [${detail.reference}] ${detail.subject}`}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-whatsapp hover:bg-whatsapp-dark text-white text-xs font-medium transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Reply via Email
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
