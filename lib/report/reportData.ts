// Data layer for the white-label PDF report.
//
// Two shapes:
//   loadCampaignReport(userId, campaignId)
//   loadRangeReport(userId, range, clientId?)
//
// Both return the same ReportData interface so the react-pdf template
// doesn't need to know which entry point produced it. clientId is a
// forward-compat filter (defaults to "all campaigns"); client tagging
// isn't built yet — the filter is here so adding it later is a
// one-line prisma where clause change and nothing else.
//
// Delivery-rate definition matches the dashboard's all-time tile
// EXACTLY: delivered / sent, computed from Contact rows. `sent` here
// covers anything that left this app (status in {sent,delivered,read}),
// mirroring lib/analytics.ts + app/api/analytics/summary/route.ts.

import { prisma } from "../prisma";

/** ISO-in strings; ISO-out interior. Kept string for JSON parity. */
export interface DateRange {
  start: Date;
  end: Date;
}

export interface ReportCampaignRow {
  id: string;
  name: string;
  createdAt: Date;
  totalCount: number;
  sent: number;
  delivered: number;
  failed: number;
  deliveryRatePct: number | null; // null = no denominator; UI shows "—"
}

export interface ReportData {
  kind: "campaign" | "range";
  range: DateRange | null;   // null on single-campaign
  campaign: { id: string; name: string; createdAt: Date } | null;
  summary: {
    campaigns: number;
    messagesSent: number;
    delivered: number;
    failed: number;
    optOuts: number;
    deliveryRatePct: number | null;
  };
  rows: ReportCampaignRow[];
}

/** Delivery rate — same shape everywhere. Returns null when the
 *  denominator is zero so the PDF (and any other consumer) can
 *  render "—" rather than 0% or NaN. */
function rate(delivered: number, sent: number): number | null {
  if (!sent) return null;
  return Math.round((delivered / sent) * 1000) / 10;
}

type StatusRow = { status: string; _count: { status: number } };

function bucket(rows: StatusRow[]) {
  const t: Record<string, number> = {
    sent: 0, delivered: 0, read: 0, failed: 0,
    skipped: 0, pending: 0, sending: 0, invalid: 0, limit_reached: 0,
  };
  for (const r of rows) t[r.status] = r._count.status;
  // "sent" upstream = anything that left the app (sent | delivered | read).
  // "delivered" upstream = delivered | read (a read message was also delivered).
  return {
    sentTotal: t.sent + t.delivered + t.read,
    deliveredTotal: t.delivered + t.read,
    failedTotal: t.failed,
    skipped: t.skipped,
  };
}

async function optOutCount(
  userId: string,
  range: DateRange | null
): Promise<number> {
  if (!range) return 0;
  return prisma.optOutLog.count({
    where: { userId, createdAt: { gte: range.start, lte: range.end } },
  });
}

// ── Single-campaign report ────────────────────────────────────────
export async function loadCampaignReport(
  userId: string,
  campaignId: string
): Promise<ReportData | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    select: { id: true, name: true, createdAt: true, totalCount: true },
  });
  if (!campaign) return null;

  const grouped = await prisma.contact.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { status: true },
  });
  const b = bucket(grouped);
  const row: ReportCampaignRow = {
    id: campaign.id,
    name: campaign.name,
    createdAt: campaign.createdAt,
    totalCount: campaign.totalCount,
    sent: b.sentTotal,
    delivered: b.deliveredTotal,
    failed: b.failedTotal,
    deliveryRatePct: rate(b.deliveredTotal, b.sentTotal),
  };

  return {
    kind: "campaign",
    range: null,
    campaign: { id: campaign.id, name: campaign.name, createdAt: campaign.createdAt },
    summary: {
      campaigns: 1,
      messagesSent: b.sentTotal,
      delivered: b.deliveredTotal,
      failed: b.failedTotal,
      optOuts: 0, // opt-outs only surface on range reports
      deliveryRatePct: rate(b.deliveredTotal, b.sentTotal),
    },
    rows: [row],
  };
}

// ── Date-range report ─────────────────────────────────────────────
export async function loadRangeReport(
  userId: string,
  range: DateRange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientId?: string | null
): Promise<ReportData> {
  // clientId is accepted for forward-compat only — client tagging
  // isn't built yet. When it lands, add
  //   ...(clientId ? { clientId } : {})
  // to the where clauses below and delete this note.

  const campaigns = await prisma.campaign.findMany({
    where: { userId, createdAt: { gte: range.start, lte: range.end } },
    select: { id: true, name: true, createdAt: true, totalCount: true },
    orderBy: { createdAt: "desc" },
  });

  const rows: ReportCampaignRow[] = [];
  let sSent = 0, sDelivered = 0, sFailed = 0;

  if (campaigns.length > 0) {
    const perCampaign = await prisma.contact.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: campaigns.map((c) => c.id) } },
      _count: { status: true },
    });
    // Bucket into per-campaign totals.
    const byCid = new Map<string, StatusRow[]>();
    for (const r of perCampaign) {
      const list = byCid.get(r.campaignId) ?? [];
      list.push({ status: r.status, _count: { status: r._count.status } });
      byCid.set(r.campaignId, list);
    }
    for (const c of campaigns) {
      const b = bucket(byCid.get(c.id) ?? []);
      sSent += b.sentTotal;
      sDelivered += b.deliveredTotal;
      sFailed += b.failedTotal;
      rows.push({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        totalCount: c.totalCount,
        sent: b.sentTotal,
        delivered: b.deliveredTotal,
        failed: b.failedTotal,
        deliveryRatePct: rate(b.deliveredTotal, b.sentTotal),
      });
    }
  }

  const optOuts = await optOutCount(userId, range);

  return {
    kind: "range",
    range,
    campaign: null,
    summary: {
      campaigns: campaigns.length,
      messagesSent: sSent,
      delivered: sDelivered,
      failed: sFailed,
      optOuts,
      deliveryRatePct: rate(sDelivered, sSent),
    },
    rows,
  };
}
