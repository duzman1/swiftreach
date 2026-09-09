// Shared materialiser: turns a ScheduledCampaign row into a real Campaign
// + Contact[] graph that the existing /api/campaigns/[id]/send loop can
// process.
//
// Used by both the cron (POST /api/cron/send-scheduled) and the manual
// "Run now" button on /scheduled. The cron also takes care of recurrence
// — this helper just creates the Campaign and returns its id.
//
// Opt-out filtering: contacts whose phoneNumber is in this user's
// SavedContact{optedOut:true} set are pre-marked status:"skipped" with
// errorMessage:"Contact has opted out". The send loop already skips
// non-pending statuses, so they're effectively suppressed without any
// extra logic in the loop.

import type { Prisma, PrismaClient } from "@prisma/client";
import { applyFilters, type FilterRule } from "./applyFilters";
import { buildMessage, type FormatRule } from "./buildMessage";
import { normalizePhone, isValidPhone } from "./phoneUtils";
import type { VariableMapping } from "./whatsapp";
import { resolveAudienceToRows, AudienceResolveError } from "./resolveAudienceContacts";

interface ScheduledLike {
  id: string;
  userId: string;
  name: string;
  mode: string;
  templateName: string | null;
  rawMessage: string | null;
  staticVars: string;
  variableMap: string;
  formatRules: string;
  phoneColumn: string;
  delayMs: number;
  contactListData: string;
  // Audience-driven schedules resolve their contact set at fire time.
  // A schedule created against an audience id has this set; a legacy
  // CSV-snapshot schedule has null.
  audienceId?: string | null;
}

/** Thrown when a scheduled run cannot proceed — the caller should
 *  mark the ScheduledCampaign row as failed and log the message.
 *  Distinct from silent errors: this is a "we deliberately did not
 *  send" signal, not a bug. Currently used for two cases:
 *  - the audience was deleted after the schedule was created
 *  - the audience currently resolves to zero contacts */
export class ScheduledMaterializeError extends Error {
  code: "AUDIENCE_DELETED" | "AUDIENCE_EMPTY" | "AUDIENCE_RULES_INVALID";
  constructor(code: ScheduledMaterializeError["code"], message: string) {
    super(message);
    this.name = "ScheduledMaterializeError";
    this.code = code;
  }
}

export async function materializeScheduledCampaign(
  prisma: PrismaClient,
  scheduled: ScheduledLike,
  options?: { defaultCountryCode?: string; filters?: FilterRule[] }
): Promise<{ campaignId: string; totalCount: number; skippedCount: number }> {
  const defaultCountryCode = options?.defaultCountryCode ?? "1";

  // Audience path (late-binding): resolve NOW to the current contact
  // set. If the audience was deleted, or currently resolves to zero,
  // we THROW — the caller flips this run to failed. Per the design
  // spec: a stale schedule-time snapshot is worse than not sending,
  // so no fallback.
  let rows: Array<Record<string, string>>;
  let phoneColumn: string;
  let audienceId: string | null = null;
  let audienceResolvedCount: number | null = null;
  let filters: FilterRule[];

  if (scheduled.audienceId) {
    try {
      const resolved = await resolveAudienceToRows(
        prisma,
        scheduled.userId,
        scheduled.audienceId,
        { expectExisting: true }
      );
      rows = resolved.rows;
      phoneColumn = "phoneNumber";
      audienceId = resolved.audienceId;
      audienceResolvedCount = resolved.resolvedCount;
      // Audience path never applies wizard filters — audience rules
      // are the filter.
      filters = [];
    } catch (e) {
      if (e instanceof AudienceResolveError) {
        throw new ScheduledMaterializeError(
          e.code === "AUDIENCE_NOT_FOUND" ? "AUDIENCE_DELETED" : e.code,
          e.message
        );
      }
      throw e;
    }
  } else {
    rows = JSON.parse(scheduled.contactListData) as Array<Record<string, string>>;
    phoneColumn = scheduled.phoneColumn;
    filters = options?.filters ?? [];
  }

  const staticVars = JSON.parse(scheduled.staticVars) as Record<string, string>;
  const variableMap = JSON.parse(scheduled.variableMap) as VariableMapping[];
  const formatRules = JSON.parse(scheduled.formatRules) as Record<string, FormatRule>;

  const filteredRows = applyFilters(rows, filters);

  // ── Opt-out lookup: pull every opted-out phone for this user up front
  // so per-row checks are a Set membership test, not N queries.
  const optedOut = await prisma.savedContact.findMany({
    where: { userId: scheduled.userId, optedOut: true },
    select: { phoneNumber: true },
  });
  const optedOutSet = new Set(optedOut.map((o) => o.phoneNumber));

  const contactsData: Prisma.ContactCreateManyCampaignInput[] = filteredRows.map(
    (row) => {
      const phoneRaw = row[phoneColumn] ?? "";
      const phone = normalizePhone(phoneRaw, defaultCountryCode);
      const phoneValid = isValidPhone(phone);

      let personalizedMessage = "";
      if (scheduled.mode === "freeform") {
        personalizedMessage = buildMessage({
          template: scheduled.rawMessage ?? "",
          rowData: row,
          staticVars,
          formatRules,
        });
      } else {
        const params = variableMap
          .map((m) => {
            if (m.source === "column" && m.column) return row[m.column] ?? "";
            if (m.source === "static") return m.value ?? "";
            return "";
          })
          .map((p, idx) => `{{${idx + 1}}}=${p}`)
          .join(", ");
        personalizedMessage = `[template:${scheduled.templateName}] ${params}`;
      }

      let status = "pending";
      let errorMessage: string | null = null;
      if (!phoneValid) {
        status = "invalid";
      } else if (optedOutSet.has(phone)) {
        status = "skipped";
        errorMessage = "Contact has opted out";
      }

      return {
        phoneNumber: phone,
        rowData: JSON.stringify(row),
        personalizedMessage,
        status,
        errorMessage,
      };
    }
  );

  const totalCount = contactsData.length;
  const skippedCount = contactsData.filter(
    (c) => c.status === "skipped" || c.status === "invalid"
  ).length;

  // The send loop reads campaign.status !== "draft" to decide whether to
  // start. We create as "draft" and let the caller flip to "sending" when
  // it actually triggers the send.
  const campaign = await prisma.campaign.create({
    data: {
      userId: scheduled.userId,
      name: scheduled.name,
      mode: scheduled.mode,
      templateName: scheduled.templateName,
      rawMessage: scheduled.rawMessage,
      staticVars: scheduled.staticVars,
      variableMap: scheduled.variableMap,
      formatRules: scheduled.formatRules,
      phoneColumn,
      delayMs: scheduled.delayMs,
      status: "draft",
      totalCount,
      skippedCount,
      audienceId,
      audienceResolvedCount,
      contacts: { create: contactsData },
    },
    select: { id: true },
  });

  return { campaignId: campaign.id, totalCount, skippedCount };
}
