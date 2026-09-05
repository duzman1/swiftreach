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
// DELIVERY-RATE DEFINITION
// Counted from Contact TIMESTAMPS, not status strings:
//   sent      = Contact.sentAt IS NOT NULL
//   delivered = Contact.deliveredAt IS NOT NULL
//   failed    = Contact.status = 'failed'
// This matches the dashboard's "Delivery rate (all time)" tile
// exactly (see app/(app)/campaigns/[id]/page.tsx comment on why
// status-based counting under-reports delivery — Meta's webhook can
// set deliveredAt without advancing status past "sent").

import { prisma } from "../prisma";

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

/** Per-campaign counts from Contact timestamps. Runs one indexed
 *  count query per metric — cheap because Contact.campaignId is
 *  indexed and each predicate is a single non-null check. */
async function campaignCounts(campaignIds: string[]): Promise<
  Map<string, { sent: number; delivered: number; failed: number }>
> {
  if (campaignIds.length === 0) return new Map();
  const [sent, delivered, failed] = await Promise.all([
    prisma.contact.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, sentAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, deliveredAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, status: "failed" },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<string, { sent: number; delivered: number; failed: number }>();
  const seed = (cid: string) => {
    if (!map.has(cid)) map.set(cid, { sent: 0, delivered: 0, failed: 0 });
    return map.get(cid)!;
  };
  for (const r of sent) seed(r.campaignId).sent = r._count._all;
  for (const r of delivered) seed(r.campaignId).delivered = r._count._all;
  for (const r of failed) seed(r.campaignId).failed = r._count._all;
  return map;
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

  const counts = await campaignCounts([campaign.id]);
  const c = counts.get(campaign.id) ?? { sent: 0, delivered: 0, failed: 0 };
  const row: ReportCampaignRow = {
    id: campaign.id,
    name: campaign.name,
    createdAt: campaign.createdAt,
    totalCount: campaign.totalCount,
    sent: c.sent,
    delivered: c.delivered,
    failed: c.failed,
    deliveryRatePct: rate(c.delivered, c.sent),
  };

  return {
    kind: "campaign",
    range: null,
    campaign: { id: campaign.id, name: campaign.name, createdAt: campaign.createdAt },
    summary: {
      campaigns: 1,
      messagesSent: c.sent,
      delivered: c.delivered,
      failed: c.failed,
      optOuts: 0, // opt-outs only surface on range reports
      deliveryRatePct: rate(c.delivered, c.sent),
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

  const counts = await campaignCounts(campaigns.map((c) => c.id));

  const rows: ReportCampaignRow[] = [];
  let sSent = 0, sDelivered = 0, sFailed = 0;
  for (const c of campaigns) {
    const cc = counts.get(c.id) ?? { sent: 0, delivered: 0, failed: 0 };
    sSent += cc.sent;
    sDelivered += cc.delivered;
    sFailed += cc.failed;
    rows.push({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      totalCount: c.totalCount,
      sent: cc.sent,
      delivered: cc.delivered,
      failed: cc.failed,
      deliveryRatePct: rate(cc.delivered, cc.sent),
    });
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
