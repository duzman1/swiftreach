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

export const dynamic = "force-dynamic";

interface ImportRow {
  phoneNumber: string;
  data?: Record<string, string>;
}

interface ImportBody {
  contacts: ImportRow[];
  defaultCountryCode?: string;
  groupId?: string; // existing group id, OR
  groupName?: string; // create a new group with this name
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
        await prisma.savedContact.update({
          where: { id: existing.id },
          data: {
            data: JSON.stringify(mergedData),
            groupIds: JSON.stringify(merged),
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
