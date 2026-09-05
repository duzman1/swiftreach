// Vercel Cron entry point — runs daily at 02:00 UTC (Hobby-plan
// cron minimum interval is daily; on Pro this could be flipped
// back to hourly for tighter recovery). Finds campaigns that have
// been stuck in "sending" status for more than the STUCK_THRESHOLD_MS
// window, marks each stuck contact as "failed" (send-loop was killed
// mid-iteration), transitions the campaign to "completed", and fires
// the alert engine so the user still receives their post-campaign
// report + email.
//
// Root cause this cleanup addresses: Vercel Hobby's 300s function
// limit. A large campaign (~115+ contacts at 2s delay) can hit the
// cap and die mid-loop, leaving one contact in "sending" state and
// the campaign in "sending" status forever. This cron guarantees such
// campaigns still finalize + generate insights within the hour.
//
// SECURITY: protected by x-cron-secret header, same pattern as
// /api/cron/send-scheduled. Vercel Cron sends CRON_SECRET; requests
// without it get 401. Also whitelisted in middleware as /api/cron/*.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCampaignAlerts } from "@/lib/campaignAlerts";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Campaigns are considered "stuck" only after this much wall time.
// 1 hour is much longer than Vercel's 300s function limit so we
// never race a legitimately-running send.
const STUCK_THRESHOLD_MS = 60 * 60 * 1000;

interface CleanupOutcome {
  campaignId: string;
  campaignName: string;
  stuckContactsFixed: number;
  alertsRun: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const stuck = await prisma.campaign.findMany({
    where: {
      status: "sending",
      createdAt: { lt: cutoff },
    },
    select: { id: true, name: true },
    take: 50, // safety cap — never process more than 50 in one tick
  });

  const outcomes: CleanupOutcome[] = [];

  for (const c of stuck) {
    try {
      // Mark any contacts still in "sending" status as failed. The
      // send loop updates the row to "sending" right before calling
      // Meta; if the function died before Meta responded, the row is
      // stuck. We can't know whether the send actually happened, so
      // we mark failed and let the user manually retry.
      const stuckContacts = await prisma.contact.updateMany({
        where: { campaignId: c.id, status: "sending" },
        data: {
          status: "failed",
          errorMessage:
            "Send interrupted (function timeout). Use Retry failed to resend.",
        },
      });

      // Complete the campaign and bump failedCount by the number we
      // just marked failed. This preserves the aggregate count that
      // was frozen when the function died mid-loop.
      await prisma.campaign.update({
        where: { id: c.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          failedCount: { increment: stuckContacts.count },
        },
      });

      // Fire the alert engine. Idempotency guard inside runCampaignAlerts
      // means this is a no-op if the campaign somehow already ran
      // through alerts (e.g. a partial cleanup on a prior tick).
      const alertResult = await runCampaignAlerts(c.id);

      outcomes.push({
        campaignId: c.id,
        campaignName: c.name,
        stuckContactsFixed: stuckContacts.count,
        alertsRun: alertResult.ok && !alertResult.alreadyRun,
      });
    } catch (err) {
      // Log and keep going — one bad campaign shouldn't stop the whole
      // cleanup batch.
      await logError(
        `cron.cleanup-stuck-campaigns[${c.id}]`,
        err
      );
      outcomes.push({
        campaignId: c.id,
        campaignName: c.name,
        stuckContactsFixed: 0,
        alertsRun: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    stuckCampaignsFound: stuck.length,
    outcomes,
    cutoffAt: cutoff.toISOString(),
  });
}
