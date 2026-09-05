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

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface CreateBody {
  phoneNumber: string;
  defaultCountryCode?: string;
  data?: Record<string, string>;
  groupIds?: string[];
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
    // Group membership: groupIds is JSON-string of an array. The cheapest
    // portable check is `contains` on the JSON text — accurate enough as
    // long as group ids are cuids (no collision with substrings of other
    // ids in practice).
    if (groupId) where.groupIds = { contains: groupId };

    const [total, contacts] = await Promise.all([
      prisma.savedContact.count({ where }),
      prisma.savedContact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
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

    // Upsert on (userId, phoneNumber) — idempotent re-add merges fields.
    const created = await prisma.savedContact.upsert({
      where: { userId_phoneNumber: { userId, phoneNumber: phone } },
      create: {
        userId,
        phoneNumber: phone,
        data: JSON.stringify(body.data ?? {}),
        groupIds: JSON.stringify(groupIds),
      },
      update: {
        data: JSON.stringify(body.data ?? {}),
        groupIds: JSON.stringify(groupIds),
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
