// "Run now" — materialise the scheduled campaign and start sending
// immediately. The user gets a campaignId back so the UI can redirect to
// the campaign progress page (which has SSE-driven live updates).
//
// We do NOT await the send loop here — it runs in the background while we
// return. Vercel will keep the function warm for the same execution as
// long as the response stream is open. Since we return immediately, the
// Promise dies. So we kick off via fetch to /api/campaigns/[id]/send
// instead — same as the user clicking "Start" from the wizard.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { isUserSuspended, suspendedResponse } from "@/lib/suspendCheck";
import { materializeScheduledCampaign } from "@/lib/materializeScheduled";
import { computeNextRunAt } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    if (await isUserSuspended(userId)) return suspendedResponse();

    const sched = await prisma.scheduledCampaign.findUnique({ where: { id: params.id } });
    if (!sched || sched.userId !== userId) {
      return NextResponse.json({ ok: false, error: "Scheduled campaign not found" }, { status: 404 });
    }
    if (sched.status === "cancelled") {
      return NextResponse.json({ ok: false, error: "This scheduled campaign was cancelled" }, { status: 400 });
    }

    // Materialise into a real Campaign + Contact[] graph. The user then
    // navigates to /campaigns/[id] which streams the SSE send.
    const { campaignId, totalCount, skippedCount } = await materializeScheduledCampaign(
      prisma,
      sched
    );

    // Update scheduling state.
    const now = new Date();
    let nextRunAt: Date | null = null;
    let nextStatus: "completed" | "scheduled" = "completed";
    if (sched.recurring) {
      nextRunAt = computeNextRunAt({
        ranAt: now,
        recurrence: (sched.recurrence as "daily" | "weekly" | "monthly" | null) ?? null,
        recurrenceDay: sched.recurrenceDay,
      });
      nextStatus = "scheduled";
    }

    await prisma.scheduledCampaign.update({
      where: { id: sched.id },
      data: {
        status: nextStatus,
        lastRunAt: now,
        nextRunAt,
        scheduledFor: nextRunAt ?? sched.scheduledFor,
      },
    });

    return NextResponse.json({
      ok: true,
      campaign: { id: campaignId, totalCount, skippedCount },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/scheduled/[id]/run-now");
  }
}
