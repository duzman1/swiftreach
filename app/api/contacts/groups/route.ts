// ContactGroup list + create. Group is a soft container — membership lives
// on SavedContact.groupIds rather than a join table, so creating a group
// is just an insert. contactCount is recomputed by import / contact CRUD.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: string;
  description?: string;
  color?: string;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const groups = await prisma.contactGroup.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ ok: true, groups });
  } catch (err) {
    return handleApiError(err, "GET /api/contacts/groups");
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

    const name = body.name?.trim();
    if (!name) return bad("Name is required");

    const created = await prisma.contactGroup.create({
      data: {
        userId,
        name,
        description: body.description?.trim() || null,
        color: body.color || "#25D366",
      },
    });
    return NextResponse.json({ ok: true, group: created });
  } catch (err) {
    return handleApiError(err, "POST /api/contacts/groups");
  }
}
