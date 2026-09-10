// Bulk import — accepts an array of {phoneNumber, data} objects (typically
// the rows the user just parsed in the campaign wizard) and upserts them
// into SavedContact in chunks. Optionally tags every imported contact
// with a group (creating the group if `groupName` is new).
//
// Returns counts so the UI can say "Imported 87 (3 duplicates merged)."

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { hasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

interface ImportRow {
  phoneNumber: string;
  data?: Record<string, string>;
  // Optional per-row client label (from the client column mapping
  // on the import screen). Null means "no label"; a client id means
  // "assign this row to this client". Pro-only; validated once per
  // import against the caller's owned clients.
  clientId?: string | null;
}

interface ImportBody {
  contacts: ImportRow[];
  defaultCountryCode?: string;
  groupId?: string; // existing group id, OR
  groupName?: string; // create a new group with this name
  // "Assign all imported contacts to this client" — applied to every
  // row that doesn't have its own clientId. Ignored on non-Pro plans
  // (validated once below, returns 403 upfront).
  defaultClientId?: string | null;

  // Consent declaration for the whole import. Covers the common case
  // ("all these came from our signup sheet on Jan 12"). Optional —
  // when omitted every imported row gets consentStatus="unknown", per
  // compliance rule 1 (never infer). fileName is stored on the
  // ContactImport row so the contact's provenance survives even
  // after the source file is gone.
  fileName?: string;
  declaredConsentStatus?: "explicit" | "imported" | "unknown";
  declaredSource?: string | null;
  declaredDate?: string | null; // ISO
  declaredNote?: string | null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: ImportBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }
    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      return bad("contacts[] is required");
    }

    const cc = body.defaultCountryCode ?? "1";

    // Resolve target group: existing id OR create from name.
    let groupId: string | null = null;
    if (body.groupId) {
      const grp = await prisma.contactGroup.findUnique({ where: { id: body.groupId } });
      if (!grp || grp.userId !== userId) return bad("Group not found", 404);
      groupId = grp.id;
    } else if (body.groupName?.trim()) {
      const grp = await prisma.contactGroup.create({
        data: { userId, name: body.groupName.trim() },
      });
      groupId = grp.id;
    }

    // Validate and resolve every client id referenced by this import
    // (default + per-row). One query per unique id, plan-gated once.
    const clientRefs = new Set<string>();
    if (body.defaultClientId) clientRefs.add(body.defaultClientId);
    for (const row of body.contacts) {
      if (row.clientId) clientRefs.add(row.clientId);
    }
    const clientOk = new Set<string>();
    if (clientRefs.size > 0) {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      });
      if (!hasFeature(owner?.plan, "perClientReporting")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Per-client reporting requires the Pro plan.",
            upgradeRequired: true,
            requiredPlan: "pro",
          },
          { status: 403 }
        );
      }
      const rows = await prisma.client.findMany({
        where: { userId, id: { in: Array.from(clientRefs) }, archived: false },
        select: { id: true },
      });
      for (const r of rows) clientOk.add(r.id);
    }

    // Create the ContactImport row up front — one per import call —
    // and thread its id onto every SavedContact we create. This is
    // the ONLY thing that promotes contacts past consentStatus=
    // "unknown" via automation: real, recorded provenance. We
    // create it even when the caller declined to declare a source,
    // so future you can still see "these 87 rows came from filename
    // X uploaded by user Y at time Z" even without a source.
    const declaredStatus =
      body.declaredConsentStatus === "explicit" ||
      body.declaredConsentStatus === "imported" ||
      body.declaredConsentStatus === "unknown"
        ? body.declaredConsentStatus
        : undefined;
    const declaredDate = body.declaredDate ? new Date(body.declaredDate) : null;
    const declaredDateOk = declaredDate && !Number.isNaN(declaredDate.getTime()) ? declaredDate : null;
    const importRow = await prisma.contactImport.create({
      data: {
        userId,
        fileName: body.fileName?.trim() || "Untitled import",
        uploadedByUserId: userId,
        declaredSource: body.declaredSource?.trim() || null,
        declaredDate: declaredDateOk,
        declaredNote: body.declaredNote?.trim() || null,
      },
    });
    const now = new Date();

    let created = 0;
    let updated = 0;
    let invalid = 0;
    const groupIdJson = JSON.stringify(groupId ? [groupId] : []);

    for (const row of body.contacts) {
      const phone = normalizePhone(row.phoneNumber, cc);
      if (!isValidPhone(phone)) {
        invalid++;
        continue;
      }

      // Per-row client wins over the default. Unknown/foreign
      // client ids are silently dropped rather than failing the
      // whole import — the count of rows kept matches created+updated.
      const rowClient = row.clientId && clientOk.has(row.clientId) ? row.clientId : null;
      const defaultClient =
        body.defaultClientId && clientOk.has(body.defaultClientId)
          ? body.defaultClientId
          : null;
      const clientId = rowClient ?? defaultClient;

      const existing = await prisma.savedContact.findUnique({
        where: { userId_phoneNumber: { userId, phoneNumber: phone } },
      });

      if (existing) {
        // Merge: union groupIds, prefer new data fields.
        const oldGroups: string[] = JSON.parse(existing.groupIds || "[]");
        const merged = groupId && !oldGroups.includes(groupId)
          ? [...oldGroups, groupId]
          : oldGroups;
        const oldData: Record<string, string> = JSON.parse(existing.data || "{}");
        const mergedData = { ...oldData, ...(row.data ?? {}) };
        // Consent handling on re-import: NEVER downgrade. If the
        // existing row already has "explicit", a re-import with
        // "imported" doesn't overwrite that (that would rewrite
        // history). Only promote: "unknown" → declared. Never
        // demote. The import always gets linked (importId) though —
        // provenance tracks the most recent recorded source.
        const currentStatus = existing.consentStatus ?? "unknown";
        const shouldPromote =
          declaredStatus &&
          currentStatus === "unknown" &&
          declaredStatus !== "unknown";
        await prisma.savedContact.update({
          where: { id: existing.id },
          data: {
            data: JSON.stringify(mergedData),
            groupIds: JSON.stringify(merged),
            // Only overwrite the existing label when the import
            // explicitly assigns one — a null clientId leaves the
            // prior label intact so a re-import doesn't wipe it.
            ...(clientId ? { clientId } : {}),
            importId: importRow.id,
            ...(shouldPromote
              ? {
                  consentStatus: declaredStatus,
                  consentRecordedAt: now,
                  ...(body.declaredSource !== undefined
                    ? { consentSource: body.declaredSource || null }
                    : {}),
                  ...(declaredDateOk !== null ? { consentDate: declaredDateOk } : {}),
                  ...(body.declaredNote !== undefined
                    ? { consentNote: body.declaredNote || null }
                    : {}),
                }
              : {}),
          },
        });
        updated++;
      } else {
        await prisma.savedContact.create({
          data: {
            userId,
            phoneNumber: phone,
            data: JSON.stringify(row.data ?? {}),
            groupIds: groupIdJson,
            clientId,
            importId: importRow.id,
            // New rows inherit whatever the import declared. If the
            // caller didn't declare, they get default "unknown".
            ...(declaredStatus
              ? {
                  consentStatus: declaredStatus,
                  consentRecordedAt: now,
                  consentSource: body.declaredSource?.trim() || null,
                  consentDate: declaredDateOk,
                  consentNote: body.declaredNote?.trim() || null,
                }
              : {}),
          },
        });
        created++;
      }
    }

    // Refresh group count (best-effort).
    if (groupId) {
      const count = await prisma.savedContact.count({
        where: { userId, groupIds: { contains: groupId } },
      });
      await prisma.contactGroup
        .update({ where: { id: groupId }, data: { contactCount: count } })
        .catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      invalid,
      groupId,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/contacts/import");
  }
}
