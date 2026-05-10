// System page — health checks, DB stats, ErrorLog viewer with clear-all
// action. Server-renders the DB-side data, client-loads health (which has
// to make outbound calls and would block the page otherwise).

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { formatNumber } from "@/lib/utils";
import { SystemHealth } from "@/components/admin/SystemHealth";
import { ErrorLogViewer } from "@/components/admin/ErrorLogViewer";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  await requireAdmin();

  const [users, campaigns, contacts, templates, errorLogs, announcements] =
    await Promise.all([
      prisma.user.count(),
      prisma.campaign.count(),
      prisma.contact.count(),
      prisma.messageTemplate.count(),
      prisma.errorLog.count(),
      prisma.announcement.count(),
    ]);

  const dbStats = [
    { label: "Users", value: users },
    { label: "Campaigns", value: campaigns },
    { label: "Contacts", value: contacts },
    { label: "Templates", value: templates },
    { label: "Error logs", value: errorLogs },
    { label: "Announcements", value: announcements },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">System</h1>
        <p className="text-sm text-slate-500 mt-1">
          Health checks, database snapshot, and recent server errors.
        </p>
      </div>

      <SystemHealth />

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 mb-4">
          Database
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {dbStats.map((s) => (
            <div key={s.label} className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="text-xl font-semibold text-slate-900 tabular-nums">
                {formatNumber(s.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ErrorLogViewer />
    </div>
  );
}
