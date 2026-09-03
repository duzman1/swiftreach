import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatsBar } from "@/components/shared/StatsBar";
import { CampaignActions } from "@/components/campaigns/CampaignActions";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { formatNumber, formatPercent } from "@/lib/utils";
import { pickContactName } from "@/lib/contactName";
import { translateError } from "@/lib/translateError";

export const dynamic = "force-dynamic";

async function loadCampaign(id: string, userId: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { id: "asc" } },
        alerts: { orderBy: { createdAt: "asc" } },
      },
    });
    // Ownership check — refuse to load campaigns belonging to other users.
    if (!campaign || campaign.userId !== userId) return null;
    return campaign;
  } catch {
    return null;
  }
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const userId = await requireUserId();
  const campaign = await loadCampaign(params.id, userId);
  if (!campaign) notFound();

  const contacts = campaign.contacts;
  // Count delivered/read from TIMESTAMPS, not from `status`. Meta's
  // status webhook can set deliveredAt/readAt without advancing the
  // row's status string past "sent" — status-based counting under-
  // reports true delivery. Timestamp-based counting is a superset
  // and matches what the per-contact table shows.
  const counts = {
    sent: contacts.filter((c) => ["sent", "delivered", "read"].includes(c.status)).length,
    delivered: contacts.filter((c) => c.deliveredAt !== null).length,
    read: contacts.filter((c) => c.readAt !== null).length,
    failed: contacts.filter((c) => c.status === "failed").length,
    skipped: contacts.filter((c) => ["skipped", "invalid", "cancelled"].includes(c.status)).length,
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <Link
          href="/campaigns"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to all campaigns
        </Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight truncate">
              {campaign.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <StatusBadge status={campaign.status} />
              <span>·</span>
              <span>
                Mode: <strong>{campaign.mode === "freeform" ? "Free-form" : "Template"}</strong>
              </span>
              <span>·</span>
              <span>Created {formatDate(campaign.createdAt)}</span>
              {campaign.completedAt && (
                <>
                  <span>·</span>
                  <span>Completed {formatDate(campaign.completedAt)}</span>
                </>
              )}
            </div>
          </div>
          <CampaignActions
            campaignId={campaign.id}
            campaignName={campaign.name}
            failedCount={counts.failed}
            failedErrors={contacts
              .filter((c) => c.status === "failed")
              .map((c) => c.errorMessage ?? "")}
          />
        </div>
      </div>

      <StatsBar
        stats={[
          {
            label: "Total",
            value: formatNumber(campaign.totalCount),
            hint: `${formatNumber(counts.skipped)} skipped/invalid`,
          },
          {
            label: "Sent",
            value: formatNumber(counts.sent),
            accent: "success",
            hint: formatPercent(counts.sent, campaign.totalCount),
          },
          {
            label: "Delivered",
            value: formatNumber(counts.delivered),
            accent: "success",
            hint: `${formatNumber(counts.read)} read`,
          },
          {
            label: "Failed",
            value: formatNumber(counts.failed),
            accent: counts.failed > 0 ? "destructive" : "default",
          },
        ]}
      />

      {campaign.alerts && campaign.alerts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
            Performance Insights
          </h3>
          {campaign.alerts.map((alert) => {
            const border =
              alert.type === "success"
                ? "border-emerald-500 bg-emerald-50"
                : alert.type === "critical"
                  ? "border-red-500 bg-red-50"
                  : alert.type === "warning"
                    ? "border-amber-500 bg-amber-50"
                    : "border-sky-500 bg-sky-50";
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border-l-4 ${border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-sm text-zinc-900">
                    {alert.title}
                  </p>
                  {alert.metric && (
                    <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-full bg-white/60 border border-zinc-200 text-zinc-700">
                      {alert.metric}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-700 mt-1">{alert.message}</p>
                {alert.recommendation && (
                  <p className="text-xs text-zinc-600 mt-2 italic">
                    💡 {alert.recommendation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {campaign.rawMessage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message template</CardTitle>
            <CardDescription>
              The {`{{token}}`} placeholders that ran for each contact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-zinc-50 rounded-md p-3 text-sm whitespace-pre-wrap break-words font-sans">
              {campaign.rawMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      {campaign.templateName && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta Template</CardTitle>
            <CardDescription>
              Template name: <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{campaign.templateName}</code>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contacts ({formatNumber(contacts.length)})</CardTitle>
          <CardDescription>
            Per-contact send result. Statuses update live via webhook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No contacts in this campaign.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Sent</th>
                    <th className="p-2 text-left">Delivered</th>
                    <th className="p-2 text-left">Read</th>
                    <th className="p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => {
                    const name = pickContactName(c.rowData, campaign.phoneColumn);
                    const friendly = translateError(c.errorMessage);
                    return (
                      <tr key={c.id} className="border-t hover:bg-zinc-50">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 max-w-[180px] truncate" title={name}>
                          {name || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 font-mono text-xs">{c.phoneNumber}</td>
                        <td className="p-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {c.sentAt ? new Date(c.sentAt).toLocaleTimeString() : "—"}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {c.deliveredAt ? new Date(c.deliveredAt).toLocaleTimeString() : "—"}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {c.readAt ? new Date(c.readAt).toLocaleTimeString() : "—"}
                        </td>
                        <td
                          className="p-2 text-xs text-red-700 max-w-[280px] truncate"
                          title={c.errorMessage ?? ""}
                        >
                          {friendly}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
