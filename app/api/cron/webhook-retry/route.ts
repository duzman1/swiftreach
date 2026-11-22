// Outbound-webhook retry worker. Runs every minute via Vercel Cron.
//
// Picks up WebhookDelivery rows where:
//   status ∈ {PENDING, FAILED}  (i.e. not DELIVERED or DEAD)
//   nextAttemptAt <= now         (due or overdue)
//   endpoint.active = true       (don't thrash on paused endpoints)
//
// For each row, calls dispatchDelivery from lib/webhookDispatcher,
// which handles the HMAC signing, 10s fetch, DB state transition,
// backoff scheduling, and endpoint-wide auto-disable. All the retry
// policy lives in that file — this cron is just the scheduler.
//
// Concurrency: dispatches run with a modest parallelism cap so a
// batch of 50 slow receivers can't blow past the function's
// maxDuration. 10 concurrent is well inside the 300s ceiling even
// when every one hits its 10s timeout (10 rounds × 10s = 100s).
//
// Secured by x-cron-secret header matching CRON_SECRET — same shape
// as the existing /api/cron/* routes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchDelivery } from "@/lib/webhookDispatcher";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
// 300s max. Typical tick is seconds; this is headroom for a backlog
// burst (eg GHL back from an outage with hundreds of FAILED rows
// coming due at once).
export const maxDuration = 300;

// Per-tick cap. Chosen to be comfortably deliverable inside
// maxDuration even when every endpoint hits its 10s timeout, and
// to bound DB round-trips per tick. Larger backlogs just spill into
// the next tick — once-per-minute cron catches up naturally.
const BATCH_SIZE = 50;

// Parallel-dispatch concurrency. Promise.allSettled with a
// chunked-worker pattern — not a true semaphore, but good enough
// for this scale.
const CONCURRENCY = 10;

async function runInParallelChunks<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  if (items.length === 0) return;
  // Slice into `concurrency` lanes, each processing its slice in
  // sequence. Means the slowest lane sets total time, which is fine
  // because every delivery has the same 10s timeout ceiling.
  const lanes: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    lanes.push(
      (async () => {
        for (let j = i; j < items.length; j += concurrency) {
          try {
            await worker(items[j]);
          } catch {
            // dispatchDelivery handles its own errors — anything
            // reaching here is unexpected but non-fatal for the batch.
          }
        }
      })()
    );
  }
  await Promise.allSettled(lanes);
}

async function handle(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    // 503, not 500 — matches the existing cron routes so Vercel's
    // cron monitor treats a missing secret as "please configure"
    // rather than "function is broken".
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
  const now = new Date();

  // Pull due rows. endpoint filter at query time so paused endpoints
  // don't thrash — their deliveries wait patiently until the user
  // re-enables, at which point the next tick picks them up.
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
      endpoint: { active: true },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  if (due.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  await runInParallelChunks(
    due,
    async (row) => {
      try {
        await dispatchDelivery(prisma, row.id);
      } catch (err) {
        // dispatchDelivery handles its own error paths, but catch here
        // belt-and-braces so one bad row never kills the batch.
        await logError("cron/webhook-retry", err, { severity: "warning" });
      }
    },
    CONCURRENCY
  );

  // Report final state for observability. Re-read terminal status of
  // the rows we touched so the cron output in Vercel's dashboard
  // shows whether the batch actually delivered or churned through
  // failures.
  const outcome = await prisma.webhookDelivery.findMany({
    where: { id: { in: due.map((r) => r.id) } },
    select: { status: true },
  });
  const counts = { delivered: 0, failed: 0, dead: 0, pending: 0 };
  for (const o of outcome) {
    if (o.status === "DELIVERED") counts.delivered++;
    else if (o.status === "FAILED") counts.failed++;
    else if (o.status === "DEAD") counts.dead++;
    else counts.pending++;
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    counts,
    durationMs: Date.now() - startedAt,
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
// Vercel Cron sends GET by default in some configurations. Accept
// both shapes; the same secret check applies.
export async function GET(req: NextRequest) {
  return handle(req);
}
