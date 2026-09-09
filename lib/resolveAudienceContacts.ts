// Server-side resolver that turns an Audience row into the row[]
// shape the campaign pipeline expects. Used by:
//   • POST /api/campaigns (immediate send)
//   • POST /api/scheduled (create — the *live rules* get saved on
//     the ScheduledCampaign, and contactListData is left empty)
//   • materializeScheduledCampaign (cron fire — resolves NOW, so
//     the fired campaign sees the current contact set, not a
//     schedule-time snapshot)
//
// Errors are distinct so callers can surface the specific reason:
//   AUDIENCE_NOT_FOUND    — id doesn't exist or belongs to someone else
//   AUDIENCE_DELETED      — scheduled path only; audienceId was set but
//                           the row is gone (SetNull FK). Per spec, we
//                           MUST fail the scheduled run — no snapshot
//                           fallback (a stale snapshot is worse than
//                           not sending).
//   AUDIENCE_RULES_INVALID — stored rules can't be parsed (shouldn't
//                           happen, but we don't crash if a row was
//                           hand-edited)
//   AUDIENCE_EMPTY        — rules resolve to zero contacts (after
//                           opt-out exclusion). Per the design
//                           override, we NEVER send on an empty
//                           audience — a bulk-messaging tool sends
//                           to nobody on ambiguity.

import type { PrismaClient } from "@prisma/client";
import { parseRules, rulesToWhere } from "./audienceResolver";

export class AudienceResolveError extends Error {
  code:
    | "AUDIENCE_NOT_FOUND"
    | "AUDIENCE_DELETED"
    | "AUDIENCE_RULES_INVALID"
    | "AUDIENCE_EMPTY";
  constructor(
    code: AudienceResolveError["code"],
    message: string
  ) {
    super(message);
    this.name = "AudienceResolveError";
    this.code = code;
  }
}

export interface ResolvedAudience {
  audienceId: string;
  audienceName: string;
  rows: Array<Record<string, string>>;
  resolvedCount: number;
}

/**
 * Resolve an audience id to the live contact row set. Excludes
 * opt-outs. The row shape matches what the wizard normally produces
 * from a CSV: each row is a flat object with `phoneNumber` plus the
 * fields stored in SavedContact.data. `phoneColumn` should therefore
 * be "phoneNumber" when the campaign body is built from an audience.
 *
 * `expectExisting` matters for the scheduled path: pass `true` when
 * an audienceId ought to exist (i.e. it was set on the scheduled row
 * at create time). If the row is now missing, we throw AUDIENCE_DELETED
 * so the cron can fail the run with a clear message instead of falling
 * back to a stale snapshot.
 */
export async function resolveAudienceToRows(
  prisma: PrismaClient,
  userId: string,
  audienceId: string,
  opts: { expectExisting?: boolean } = {}
): Promise<ResolvedAudience> {
  const audience = await prisma.audience.findUnique({ where: { id: audienceId } });
  if (!audience || audience.userId !== userId) {
    throw new AudienceResolveError(
      opts.expectExisting ? "AUDIENCE_DELETED" : "AUDIENCE_NOT_FOUND",
      opts.expectExisting
        ? "This scheduled campaign's audience was deleted. The run was skipped — pick a new audience or delete this scheduled campaign."
        : "Audience not found"
    );
  }

  let rulesObj;
  try {
    rulesObj = parseRules(JSON.parse(audience.rules));
  } catch (e) {
    throw new AudienceResolveError(
      "AUDIENCE_RULES_INVALID",
      e instanceof Error ? e.message : "Audience rules are invalid"
    );
  }

  const where = rulesToWhere(rulesObj, userId);
  // Exclude opt-outs at resolve time. The materialiser opt-out
  // suppression is a belt on top of these braces — this way the
  // resolved count the user sees ("N contacts will receive this")
  // matches the number that actually get sent.
  const contacts = await prisma.savedContact.findMany({
    where: { AND: [where, { optedOut: false }] },
    select: { phoneNumber: true, data: true },
    orderBy: { updatedAt: "desc" },
  });

  if (contacts.length === 0) {
    throw new AudienceResolveError(
      "AUDIENCE_EMPTY",
      `Audience "${audience.name}" has zero contacts today. Send blocked — update the rules or pick a different audience.`
    );
  }

  const rows = contacts.map((c) => {
    let data: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(c.data);
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      /* keep data empty on parse failure — phoneNumber alone still sends */
    }
    // Flatten to a row: string values only (matches CSV row shape).
    // Nested objects/arrays get JSON-stringified so downstream
    // buildMessage doesn't crash on {{addr}} → "[object Object]".
    const row: Record<string, string> = { phoneNumber: c.phoneNumber };
    for (const [k, v] of Object.entries(data)) {
      if (k === "phoneNumber") continue; // phoneNumber column wins
      row[k] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return row;
  });

  return {
    audienceId: audience.id,
    audienceName: audience.name,
    rows,
    resolvedCount: rows.length,
  };
}
