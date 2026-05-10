// Announcements CRUD. Only one row may be `active` at any time — POSTing a
// new active announcement (or PATCHing an existing one to active) wraps the
// flip in a transaction that deactivates everything else first.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["info", "warning", "success"] as const;
const VALID_TARGETS = ["all", "free", "paid"] as const;

export async function GET() {
  try {
    await requireAdmin();
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, announcements });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/announcements");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    let body: {
      message?: string;
      type?: string;
      target?: string;
      active?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }
    const type = (VALID_TYPES as readonly string[]).includes(body.type ?? "")
      ? body.type!
      : "info";
    const target = (VALID_TARGETS as readonly string[]).includes(body.target ?? "")
      ? body.target!
      : "all";
    const active = Boolean(body.active);

    // Transactional swap: if we're publishing this as active, deactivate
    // every other row first so only one banner is live at a time.
    const created = await prisma.$transaction(async (tx) => {
      if (active) {
        await tx.announcement.updateMany({
          where: { active: true },
          data: { active: false },
        });
      }
      return tx.announcement.create({
        data: { message, type, target, active },
      });
    });

    return NextResponse.json({ ok: true, announcement: created });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/announcements");
  }
}
