"use client";

// Admin users list. Search, filter, sort, paginate. Each row links to the
// user detail page. The actions menu (suspend/unsuspend/delete) lives on
// the detail page — keeping the list view read-only avoids "oops I clicked
// delete on the wrong row".

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  plan: string;
  stripeSubscriptionStatus: string | null;
  suspended: boolean;
  messagesUsedThisMonth: number;
  createdAt: string;
}

interface ListResponse {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: AdminUser[];
  error?: string;
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-slate-100 text-slate-700",
  starter: "bg-indigo-100 text-indigo-700",
  growth: "bg-emerald-100 text-emerald-700",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-600",
  trialing: "bg-blue-100 text-blue-700",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [plan, setPlan] = useState(params.get("plan") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "newest");
  const page = parseInt(params.get("page") ?? "1", 10) || 1;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounce the search input so we don't spam the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (plan) sp.set("plan", plan);
      if (status) sp.set("status", status);
      if (sort && sort !== "newest") sp.set("sort", sort);
      // Reset to page 1 when filters change.
      router.replace(`/admin/users${sp.toString() ? `?${sp.toString()}` : ""}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, plan, status, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams(params.toString());
    fetch(`/api/admin/users?${sp.toString()}`)
      .then((r) => r.json())
      .then((j: ListResponse) => {
        if (cancelled) return;
        if (!j.ok) {
          setErr(j.error ?? "Failed to load users");
        } else {
          setData(j);
        }
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
    router.replace(`/admin/users?${sp.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data ? `${data.total.toLocaleString()} total` : "Loading…"}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search email or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm bg-white sm:col-start-4"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="usage">Highest usage</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Usage</th>
                <th className="px-4 py-3 text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {err && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-red-600">
                    {err}
                  </td>
                </tr>
              )}
              {data?.users.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No users match these filters
                  </td>
                </tr>
              )}
              {data?.users.map((u) => {
                const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-indigo-600 hover:underline font-medium"
                      >
                        {u.email}
                      </Link>
                      {name && <div className="text-xs text-slate-500">{name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          PLAN_BADGE[u.plan] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.suspended ? (
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                          suspended
                        </span>
                      ) : u.stripeSubscriptionStatus ? (
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                            STATUS_BADGE[u.stripeSubscriptionStatus] ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {u.stripeSubscriptionStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u.messagesUsedThisMonth.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
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
              Page {data.page} of {data.totalPages} · {data.total.toLocaleString()} users
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
