// Data layer for the white-label PDF report.
//
// Two shapes:
//   loadCampaignReport(userId, campaignId)
//   loadRangeReport(userId, range, clientId?)
//
// Both return the same ReportData interface so the react-pdf template
// doesn't need to know which entry point produced it.
//
// ─────────────────────────────────────────────────────────────────
// CLIENT SCOPING RULE — READ THIS BEFORE CHANGING FILTER LOGIC
// ─────────────────────────────────────────────────────────────────
// The per-client filter scopes by **Campaign.clientId ONLY** for
// every campaign-count and message-count in this report and in the
// analytics endpoints. It does NOT look at SavedContact.clientId
// for those numbers, and there is no fallback join.
//
// Concretely, for a range report filtered to Client A:
//   * Campaigns loaded  = Campaign where userId AND clientId = A
//   * Recipients counted = every Contact row of those campaigns,
//                          regardless of what SavedContact.clientId
//                          any given recipient carries
//   * Delivered/failed  = same as above, from Contact timestamps
//
// Example — a campaign labelled Client A with 500 recipients,
// where 200 of those recipients' SavedContact rows are labelled
// Client B: the Client A report counts all 500. The Client B
// report counts 0 (Client B has no campaigns of its own).
//
// The ONE exception is opt-out counts. OptOutLog rows have no
// campaignId, so the only way to attribute an opt-out to a client
// is to join through SavedContact.phoneNumber → SavedContact.
// clientId. That join is documented inline in optOutCount() below.
//
// Consequence — a campaign that was never labelled is invisible to
// every client-filtered report. The empty-state message (see
// CampaignReport.tsx and app/(app)/analytics/page.tsx) surfaces
// this explicitly rather than silently saying "no campaigns in
// this period."
//
// ─────────────────────────────────────────────────────────────────
// DELIVERY-RATE DEFINITION
// ─────────────────────────────────────────────────────────────────
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
  /** Name of the client this report was filtered to. null when no
   *  client filter was applied (or on single-campaign reports). */
  clientName: string | null;
  /** For range reports with a client filter: the total number of
   *  campaigns in the same period IGNORING the client filter. Lets
   *  the empty-state cell distinguish "no campaigns in period" from
   *  "campaigns exist but none labelled with this client". Null on
   *  single-campaign reports and range reports without a filter. */
  unfilteredCampaignsInPeriod: number | null;
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
  range: DateRange | null,
  clientFilter: { clientId?: string | null } = {}
): Promise<number> {
  if (!range) return 0;

  // Client-scoped opt-out counts now go through OptOutLog.campaignId
  // (set at insert time by lib/optOut.ts within a bounded lookback
  // window). This is the same rule as every other filtered number
  // in the report — Campaign.clientId, no SavedContact-side fallback.
  //
  // Rows with campaignId = null are "unattributable" and are
  // deliberately excluded from every client-filtered count. They
  // still appear in the unfiltered view (no `campaign` predicate).
  if (Object.keys(clientFilter).length > 0) {
    return prisma.optOutLog.count({
      where: {
        userId,
        createdAt: { gte: range.start, lte: range.end },
        // Only rows whose owning campaign matches the client filter.
        // The `is: { …, userId }` guard is belt-and-suspenders — the
        // outer userId already scopes but a nested campaign check
        // guarantees no cross-tenant read even if the FK ever drifts.
        campaign: { is: { userId, ...clientFilter } },
      },
    });
  }

  // Unfiltered — count everything, including unattributable rows.
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
    clientName: null,
    unfilteredCampaignsInPeriod: null,
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
  /**
   * Optional per-client filter. Accepted values:
   *   null | undefined  → no filter (every client + unassigned)
   *   "unassigned"      → only campaigns with no client label
   *   "<client-id>"     → only campaigns for that specific client
   *
   * Ownership of the client id is NOT checked here — the calling
   * route validates it against the User before invoking us.
   */
  clientId?: string | null
): Promise<ReportData> {
  const clientFilter: { clientId?: string | null } =
    clientId === "unassigned"
      ? { clientId: null }
      : clientId
        ? { clientId }
        : {};

  const campaigns = await prisma.campaign.findMany({
    where: {
      userId,
      ...clientFilter,
      createdAt: { gte: range.start, lte: range.end },
    },
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

  const optOuts = await optOutCount(userId, range, clientFilter);

  // Client-scoped reports resolve the client's name (or an
  // "Unassigned" placeholder) + the unfiltered campaign count in
  // the same period. Both feed the filter-aware empty state so a
  // client-filtered report with zero rows can tell the user "you
  // sent N campaigns but none were labelled for this client"
  // instead of the (misleading) "no campaigns sent in this period".
  let clientName: string | null = null;
  let unfilteredCampaignsInPeriod: number | null = null;
  if (clientId) {
    if (clientId === "unassigned") {
      clientName = "Unassigned";
    } else {
      const c = await prisma.client.findFirst({
        where: { id: clientId, userId },
        select: { name: true },
      });
      clientName = c?.name ?? null;
    }
    unfilteredCampaignsInPeriod = await prisma.campaign.count({
      where: { userId, createdAt: { gte: range.start, lte: range.end } },
    });
  }

  return {
    kind: "range",
    range,
    clientName,
    unfilteredCampaignsInPeriod,
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
