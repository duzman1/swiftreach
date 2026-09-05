// Vercel Cron entry point — runs every minute. Picks up every
// ScheduledCampaign whose scheduledFor is past due (status:"scheduled"),
// materialises into a real Campaign, and runs the send loop synchronously.
//
// SECURITY: protected by x-cron-secret header. Vercel Cron sends the value
// of CRON_SECRET; without a match we 401.
//
// Time budget: each invocation has 900s (Vercel Pro). Sending happens
// sequentially — runCampaignSend has an 870s soft cap so we stay under
// Vercel's hard limit. Anything not finished within the budget stays in
// "sending" status and resumes on the next tick (runCampaignSend
// re-selects pending contacts).
//
// Recurrence: after a successful run, computeNextRunAt() sets the next
// scheduledFor; the row stays as "scheduled" so the cron picks it up
// again. One-time campaigns flip to "completed".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import {
  DEFAULT_API_VERSION,
  type WhatsAppCredentials,
} from "@/lib/whatsapp";
import { materializeScheduledCampaign } from "@/lib/materializeScheduled";
import { runCampaignSendSafe } from "@/lib/runCampaign";
import { computeNextRunAt } from "@/lib/recurrence";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

interface RunOutcome {
  scheduledId: string;
  userId: string;
  campaignId?: string;
  status: string;
  reason?: string;
}

async function loadCreds(userId: string): Promise<WhatsAppCredentials | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  if (!u.whatsappApiToken || !u.whatsappPhoneNumberId) return null;
  const token = decrypt(u.whatsappApiToken);
  if (!token) return null;
  return {
    apiToken: token,
    phoneNumberId: u.whatsappPhoneNumberId,
    apiVersion: u.whatsappApiVersion ?? DEFAULT_API_VERSION,
  };
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
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  // Tighter overall budget than runCampaignSend's per-campaign budget so
  // one big campaign can't starve everyone else's tick.
  const overallBudgetMs = 240_000;

  const due = await prisma.scheduledCampaign.findMany({
    where: { status: "scheduled", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: 25, // cap per-tick fan-out
  });

  const outcomes: RunOutcome[] = [];

  for (const sched of due) {
    if (Date.now() - startedAt > overallBudgetMs) {
      outcomes.push({
        scheduledId: sched.id,
        userId: sched.userId,
        status: "deferred",
        reason: "tick budget exhausted",
      });
      continue;
    }

    // Skip suspended users — their account is paused, so don't even bother
    // materialising. The schedule stays "scheduled" so when they're
    // reactivated, the cron picks it back up.
    const owner = await prisma.user.findUnique({
      where: { id: sched.userId },
      select: { suspended: true },
    });
    if (owner?.suspended) {
      outcomes.push({
        scheduledId: sched.id,
        userId: sched.userId,
        status: "skipped",
        reason: "user suspended",
      });
      continue;
    }

    // Mark as running ASAP so a second concurrent tick (shouldn't happen,
    // but be defensive) doesn't double-fire the same row.
    await prisma.scheduledCampaign.update({
      where: { id: sched.id },
      data: { status: "running" },
    });

    try {
      const creds = await loadCreds(sched.userId);
      if (!creds) {
        await prisma.scheduledCampaign.update({
          where: { id: sched.id },
          data: { status: "failed" },
        });
        await logError("cron/send-scheduled", new Error("missing creds"), {
          userId: sched.userId,
        });
        outcomes.push({
          scheduledId: sched.id,
          userId: sched.userId,
          status: "failed",
          reason: "missing credentials",
        });
        continue;
      }

      const { campaignId } = await materializeScheduledCampaign(prisma, sched);
      const result = await runCampaignSendSafe(prisma, campaignId, sched.userId, creds);

      // Schedule next run (recurrence) or mark complete.
      const now = new Date();
      let nextRunAt: Date | null = null;
      let nextStatus = "completed";
      if (sched.recurring) {
        nextRunAt = computeNextRunAt({
          ranAt: now,
          recurrence: (sched.recurrence as "daily" | "weekly" | "monthly" | null) ?? null,
          recurrenceDay: sched.recurrenceDay,
        });
        if (nextRunAt) nextStatus = "scheduled";
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

      outcomes.push({
        scheduledId: sched.id,
        userId: sched.userId,
        campaignId,
        status: result.status,
        reason: result.reason,
      });
    } catch (err) {
      await prisma.scheduledCampaign.update({
        where: { id: sched.id },
        data: { status: "failed" },
      });
      await logError("cron/send-scheduled", err, { userId: sched.userId });
      outcomes.push({
        scheduledId: sched.id,
        userId: sched.userId,
        status: "failed",
        reason: err instanceof Error ? err.message : "exception",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: outcomes.length,
    durationMs: Date.now() - startedAt,
    outcomes,
  });
}

// GET — Vercel Cron sends GET by default in some configurations. Accept
// both shapes; same auth check applies.
export async function GET(req: NextRequest) {
  return POST(req);
}
