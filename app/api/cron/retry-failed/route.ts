// Vercel Cron entry point — runs daily at 03:00 UTC (Hobby-plan
// cron minimum interval is daily; on Pro this could be flipped to
// something more responsive like every 30 minutes). Finds completed
// campaigns that have failed contacts, are opted-in to auto-retry,
// and have not yet been auto-retried, then runs one pass of the
// retry engine on each.
//
// SECURITY: matches the existing send-scheduled cron pattern —
// x-cron-secret header must equal CRON_SECRET.
//
// Idempotency: autoRetryRanAt is stamped BEFORE the retry begins to
// prevent a second cron tick from double-firing on the same campaign
// while the first is still running. If the retry throws, the stamp
// remains — we treat the retry as attempted and don't try again
// automatically. Users can still trigger the existing manual retry
// (PUT /retry) to try again.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retryCampaignFailed } from "@/lib/retryEngine";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Campaigns become eligible for auto-retry after this cooldown from
// completion. 30 min is generous — enough time for late Meta delivery
// webhooks to update contact statuses (avoids retrying a contact that
// actually did deliver but hadn't shown the webhook yet), while
// still feeling responsive.
const AUTO_RETRY_COOLDOWN_MS = 30 * 60 * 1000;

// Safety cap — never process more than N campaigns in one tick to
// stay under the 60s function budget. Each retry does ~1s per
// contact; assuming worst case of 20 failures per campaign, this
// gives us ~50s per campaign which is > the max we can absorb.
const MAX_CAMPAIGNS_PER_TICK = 5;

// Auto-retry attempts each contact at most this many times.
const AUTO_RETRY_MAX = 1;

interface Outcome {
  campaignId: string;
  campaignName: string;
  retried: number;
  delivered: number;
  stillFailed: number;
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

  const cutoff = new Date(Date.now() - AUTO_RETRY_COOLDOWN_MS);

  const eligible = await prisma.campaign.findMany({
    where: {
      status: "completed",
      autoRetryEnabled: true,
      autoRetryRanAt: null,
      completedAt: { lte: cutoff },
      failedCount: { gt: 0 },
    },
    select: { id: true, name: true, failedCount: true },
    take: MAX_CAMPAIGNS_PER_TICK,
    orderBy: { completedAt: "asc" }, // oldest waiting first
  });

  const outcomes: Outcome[] = [];

  for (const c of eligible) {
    // Idempotency stamp goes FIRST so a concurrent cron tick sees
    // this campaign as already handled.
    try {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { autoRetryRanAt: new Date() },
      });
    } catch (err) {
      // If the stamp fails, skip this campaign this tick.
      await logError(`cron.retry-failed.stamp[${c.id}]`, err);
      continue;
    }

    try {
      const result = await retryCampaignFailed(c.id, AUTO_RETRY_MAX);
      outcomes.push({
        campaignId: c.id,
        campaignName: c.name,
        retried: result.total,
        delivered: result.succeeded,
        stillFailed: result.stillFailed,
      });
    } catch (err) {
      await logError(`cron.retry-failed.run[${c.id}]`, err);
      outcomes.push({
        campaignId: c.id,
        campaignName: c.name,
        retried: 0,
        delivered: 0,
        stillFailed: c.failedCount,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    outcomes,
    cutoffAt: cutoff.toISOString(),
  });
}
