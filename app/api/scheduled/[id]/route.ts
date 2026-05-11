// Single scheduled-campaign edit + cancel.
// PUT  — patch a subset of fields (name, scheduledFor, recurrence, etc.).
// DEL  — sets status to "cancelled" rather than hard-deleting so the row
//        remains visible in audit/history. Re-enable by editing.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface UpdateBody {
  name?: string;
  scheduledFor?: string;
  timezone?: string;
  delayMs?: number;
  recurring?: boolean;
  recurrence?: "daily" | "weekly" | "monthly" | null;
  recurrenceDay?: number | null;
  status?: "scheduled" | "cancelled";
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function loadOwned(id: string, userId: string) {
  const row = await prisma.scheduledCampaign.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await loadOwned(params.id, userId);
    if (!existing) return bad("Scheduled campaign not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const t = body.name.trim();
      if (!t) return bad("Name can't be blank");
      data.name = t;
    }
    if (typeof body.scheduledFor === "string") {
      const d = new Date(body.scheduledFor);
      if (Number.isNaN(d.getTime())) return bad("scheduledFor is not a valid date");
      // Allow rescheduling into the past only when cancelling.
      if (d.getTime() < Date.now() - 60_000 && body.status !== "cancelled") {
        return bad("scheduledFor must be in the future");
      }
      data.scheduledFor = d;
      data.nextRunAt = d;
    }
    if (typeof body.timezone === "string" && body.timezone.trim()) {
      data.timezone = body.timezone.trim();
    }
    if (typeof body.delayMs === "number" && Number.isFinite(body.delayMs)) {
      data.delayMs = Math.max(500, Math.min(60000, Math.round(body.delayMs)));
    }
    if (typeof body.recurring === "boolean") {
      data.recurring = body.recurring;
      if (!body.recurring) {
        data.recurrence = null;
        data.recurrenceDay = null;
      }
    }
    if (body.recurrence === "daily" || body.recurrence === "weekly" || body.recurrence === "monthly") {
      data.recurrence = body.recurrence;
    } else if (body.recurrence === null) {
      data.recurrence = null;
    }
    if (typeof body.recurrenceDay === "number") {
      data.recurrenceDay = body.recurrenceDay;
    } else if (body.recurrenceDay === null) {
      data.recurrenceDay = null;
    }
    if (body.status === "scheduled" || body.status === "cancelled") {
      data.status = body.status;
    }

    const updated = await prisma.scheduledCampaign.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ ok: true, scheduled: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/scheduled/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await loadOwned(params.id, userId);
    if (!existing) return bad("Scheduled campaign not found", 404);

    // Soft-cancel — keeps the row for history, prevents the cron from
    // picking it up.
    await prisma.scheduledCampaign.update({
      where: { id: params.id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/scheduled/[id]");
  }
}
