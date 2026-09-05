// Toggle an automation between "active" and "paused". POST is
// idempotent-toggle style: if currently active it goes to paused
// and vice versa. "archived" is out of scope here — that's set via
// the main PUT route.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.automation.findUnique({
      where: { id: params.id },
      select: { userId: true, status: true },
    });
    assertOwnership(existing, userId, "Automation not found");

    // If it was archived, leave it archived — you can't pause/unpause
    // an archived automation without un-archiving via PUT first.
    if (existing.status === "archived") {
      return NextResponse.json({
        ok: true,
        automation: { status: "archived" },
        message: "Automation is archived — un-archive to pause/resume.",
      });
    }

    const nextStatus = existing.status === "active" ? "paused" : "active";
    const updated = await prisma.automation.update({
      where: { id: params.id },
      data: { status: nextStatus },
      select: { id: true, status: true, name: true },
    });
    return NextResponse.json({ ok: true, automation: updated });
  } catch (err) {
    return handleApiError(err, "POST /api/automations/[id]/pause");
  }
}
