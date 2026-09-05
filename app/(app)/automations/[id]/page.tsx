// Automation detail page — stats, message preview, upcoming
// contacts (next 30 days), run history, and full contact list.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { formatMonthDay } from "@/lib/dateUtils";
import { AutomationRowActions } from "@/components/automations/AutomationRowActions";

export const dynamic = "force-dynamic";

export default async function AutomationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const userId = await requireUserId();
  const automation = await prisma.automation.findUnique({
    where: { id: params.id },
    include: {
      contacts: {
        orderBy: [{ month: "asc" }, { day: "asc" }],
      },
      runs: {
        orderBy: { runDate: "desc" },
        take: 30,
      },
    },
  });
  if (!automation || automation.userId !== userId) notFound();

  const contacts = automation.contacts;
  const currentYear = new Date().getFullYear();
  const sentThisYear = contacts.filter(
    (c) => c.lastSentYear === currentYear
  ).length;

  // Upcoming — next 30 days of matches, expanded across years
  // so Dec-30 birthdays show up when viewed on Jan 3 the following
  // year. We just enumerate the next 30 days and check which
  // contacts fall on each.
  const upcoming: Array<{
    date: Date;
    contacts: typeof contacts;
  }> = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const matches = contacts.filter((c) => c.month === month && c.day === day);
    if (matches.length > 0) upcoming.push({ date: d, contacts: matches });
  }

  const typeIcon =
    automation.type === "birthday"
      ? "🎂"
      : automation.type === "anniversary"
        ? "💍"
        : "📅";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link
          href="/automations"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Automations
        </Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <span>{typeIcon}</span>
              {automation.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <StatusPill status={automation.status} />
              <span>·</span>
              <span>{automation.type.replace("_", " ")}</span>
              <span>·</span>
              <span>{contacts.length} contacts</span>
            </div>
          </div>
          <AutomationRowActions
            automationId={automation.id}
            status={automation.status}
            contactCount={contacts.length}
          />
        </div>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        <strong>Send window:</strong> Messages send between 5am–9am your
        recipients&apos; local time zone (US). Daily cron fires at 13:00 UTC.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total contacts" value={contacts.length.toString()} />
        <StatCard
          label={`Sent this year (${currentYear})`}
          value={sentThisYear.toString()}
        />
        <StatCard
          label="Next upcoming"
          value={
            upcoming[0]
              ? `${formatMonthDay(upcoming[0].date.getMonth() + 1, upcoming[0].date.getDate())} · ${upcoming[0].contacts.length}`
              : "—"
          }
        />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-500">
          Message preview
        </h2>
        {automation.mode === "freeform" ? (
          <pre className="mt-2 bg-zinc-50 rounded-md p-3 text-sm whitespace-pre-wrap break-words font-sans">
            {automation.message}
          </pre>
        ) : (
          <div className="mt-2 text-sm text-zinc-700">
            Template:{" "}
            <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs">
              {automation.templateName}
            </code>{" "}
            · {automation.templateLanguage}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-500 mb-3">
            Upcoming (next 30 days)
          </h2>
          <ul className="divide-y divide-zinc-100">
            {upcoming.slice(0, 10).map((u, i) => (
              <li
                key={i}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <div className="font-medium text-zinc-900">
                  {formatMonthDay(u.date.getMonth() + 1, u.date.getDate())}
                </div>
                <div className="text-zinc-600 truncate">
                  {u.contacts
                    .slice(0, 3)
                    .map((c) => c.name || c.phoneNumber)
                    .join(", ")}
                  {u.contacts.length > 3 && (
                    <span className="text-zinc-400">
                      {" "}
                      +{u.contacts.length - 3} more
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-500 mb-3">
          Run history
        </h2>
        {automation.runs.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">
            No runs yet — the first run happens on the next matching date.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Found</th>
                  <th className="px-3 py-2 text-right">Sent</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {automation.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-xs text-zinc-700 whitespace-nowrap">
                      {new Date(r.runDate).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.contactsFound}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {r.sent}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">
                      {r.failed}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                      {r.skipped}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                          r.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : r.status === "partial"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-zinc-500 mb-3">
          Contacts ({contacts.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Last sent</th>
                <th className="px-3 py-2 text-right">Total sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    {c.name || (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.phoneNumber}
                  </td>
                  <td className="px-3 py-2">{formatMonthDay(c.month, c.day)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {c.lastSentAt
                      ? new Date(c.lastSentAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.totalSent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    archived: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  const dots: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-amber-500",
    archived: "bg-zinc-400",
  };
  const tone = tones[status] ?? tones.paused;
  const dot = dots[status] ?? dots.paused;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${tone}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
