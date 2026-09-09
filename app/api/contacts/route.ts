// SavedContact CRUD — list (paginated, searchable, filterable) + create.
//
// `data` is free-form JSON of fields the user wants to remember about this
// contact ({"Name":"John","Balance":150}). `groupIds` is a JSON array of
// ContactGroup ids — denormalised to keep group selection cheap.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { hasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Ceiling for the ?idsOnly=1 mode. Matches the bulk-assign route's
// 500-per-call limit — the two are used together for "select all N
// matching, then bulk assign / delete", so a larger cap here would
// just produce a selection the assign call couldn't act on.
const IDS_ONLY_CAP = 500;

interface CreateBody {
  phoneNumber: string;
  defaultCountryCode?: string;
  data?: Record<string, string>;
  groupIds?: string[];
  // Optional per-client label — Pro only. Validated + gated inline.
  // Sending a foreign or unknown id returns 404; sending null (or
  // omitting) creates the contact unlabelled.
  clientId?: string | null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const url = new URL(req.url);
    const search = url.searchParams.get("q")?.trim() ?? "";
    const groupId = url.searchParams.get("groupId") ?? "";
    const status = url.searchParams.get("status") ?? ""; // active|opted_out
    // Per-client filter: `unassigned` shorthand for "no label", or a
    // client id for a specific label. Empty = all.
    const clientFilter = url.searchParams.get("clientId") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const where: Prisma.SavedContactWhereInput = { userId };
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { data: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status === "opted_out") where.optedOut = true;
    if (status === "active") where.optedOut = false;
    if (clientFilter === "unassigned") where.clientId = null;
    else if (clientFilter) where.clientId = clientFilter;
    // Group membership: groupIds is JSON-string of an array. The cheapest
    // portable check is `contains` on the JSON text — accurate enough as
    // long as group ids are cuids (no collision with substrings of other
    // ids in practice).
    if (groupId) where.groupIds = { contains: groupId };

    // idsOnly=1 short-circuits to a cheap ids-only fetch across the
    // whole filter (not just the current page). Used by the contacts
    // page's "Select all N matching" flow so a bulk action can act
    // on the true match set rather than just the loaded page.
    if (url.searchParams.get("idsOnly") === "1") {
      const total = await prisma.savedContact.count({ where });
      const rows = await prisma.savedContact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: IDS_ONLY_CAP,
        select: { id: true },
      });
      return NextResponse.json({
        ok: true,
        ids: rows.map((r) => r.id),
        total,
        capped: total > IDS_ONLY_CAP,
        cap: IDS_ONLY_CAP,
      });
    }

    const [total, contacts] = await Promise.all([
      prisma.savedContact.count({ where }),
      prisma.savedContact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { client: { select: { id: true, name: true, color: true } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      contacts,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/contacts");
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const phone = normalizePhone(body.phoneNumber ?? "", body.defaultCountryCode ?? "1");
    if (!isValidPhone(phone)) return bad("Invalid phone number");

    const groupIds = Array.isArray(body.groupIds) ? body.groupIds : [];

    // Validate the client label if one was sent. Same shape the PUT
    // handler uses — hasFeature gate, ownership check, non-archived.
    let clientId: string | null = null;
    if (body.clientId) {
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
      const client = await prisma.client.findUnique({ where: { id: body.clientId } });
      if (!client || client.userId !== userId) return bad("Client not found", 404);
      if (client.archived) {
        return bad("Cannot assign an archived client. Unarchive it first.", 400);
      }
      clientId = client.id;
    }

    // Upsert on (userId, phoneNumber) — idempotent re-add merges fields.
    // clientId is only set on the update branch if the caller sent one,
    // so re-adding a labelled contact with no clientId doesn't wipe it.
    const created = await prisma.savedContact.upsert({
      where: { userId_phoneNumber: { userId, phoneNumber: phone } },
      create: {
        userId,
        phoneNumber: phone,
        data: JSON.stringify(body.data ?? {}),
        groupIds: JSON.stringify(groupIds),
        clientId,
      },
      update: {
        data: JSON.stringify(body.data ?? {}),
        groupIds: JSON.stringify(groupIds),
        ...(body.clientId !== undefined ? { clientId } : {}),
      },
    });

    // Bump group counts for any group this contact is in (best-effort).
    if (groupIds.length > 0) {
      await recomputeGroupCounts(userId, groupIds);
    }

    return NextResponse.json({ ok: true, contact: created });
  } catch (err) {
    return handleApiError(err, "POST /api/contacts");
  }
}

// Recompute contactCount for the listed groups. Cheap because the SavedContact
// table is per-user and indexed.
async function recomputeGroupCounts(userId: string, groupIds: string[]) {
  for (const gid of groupIds) {
    const count = await prisma.savedContact.count({
      where: { userId, groupIds: { contains: gid } },
    });
    await prisma.contactGroup
      .update({ where: { id: gid }, data: { contactCount: count } })
      .catch(() => undefined); // ignore if group doesn't exist
  }
}
