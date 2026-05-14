"use client";

// Read-only table of the user's recent support tickets. Initial rows
// come from the server page; future iterations could refresh on submit
// via a callback or polling, but for v1 a page reload is fine.

import { Inbox } from "lucide-react";

interface Row {
  id: string;
  reference: string;
  category: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  normal: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-100 text-zinc-600",
};

export function SupportHistoryTable({ initial }: { initial: Row[] }) {
  if (initial.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        <Inbox className="w-6 h-6 mx-auto mb-2 text-zinc-400" />
        No support requests yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Reference</th>
            <th className="px-3 py-2 text-left">Subject</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {initial.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-zinc-900 truncate max-w-xs">
                  {r.subject}
                </div>
                <div className="text-[11px] text-zinc-500">{r.category}</div>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded-full ${
                    PRIORITY_BADGE[r.priority] ?? "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {r.priority}
                </span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded-full ${
                    STATUS_BADGE[r.status] ?? "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {r.status.replace("_", " ")}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-xs text-zinc-500">
                {new Date(r.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
