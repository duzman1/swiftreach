// "Send test event" button target.
//
// Inserts a WebhookDelivery row with a mock payload shaped like a
// real message.sent event. The dispatcher (Step 4) will try to
// deliver it on the next pass, and the retry worker (Step 5) keeps
// pushing on failure. Response includes the deliveryId so the UI
// can poll /api/webhooks/deliveries and show the result.
//
// Test events BYPASS the endpoint's `events` subscription filter.
// The whole point of the test button is to verify the endpoint is
// reachable regardless of what's subscribed — a user who subscribes
// only to contact.opted_out still needs to be able to press "test".
//
// Rate-limited in-memory per endpoint so a user hammering the button
// can't flood the dispatcher queue.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { computeEventId } from "@/lib/webhookEvents";
import { dispatchDelivery } from "@/lib/webhookDispatcher";

export const dynamic = "force-dynamic";

// Per-endpoint rate limit. Generous enough for debugging (hit it,
// adjust, hit it again), stingy enough that a stuck-finger loop
// doesn't fill WebhookDelivery with thousands of test rows.
const TEST_PER_MINUTE = 5;
const testBuckets = new Map<string, { count: number; resetAt: number }>();

function checkTestRate(endpointId: string): boolean {
  const now = Date.now();
  const b = testBuckets.get(endpointId);
  if (!b || b.resetAt < now) {
    testBuckets.set(endpointId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= TEST_PER_MINUTE) return false;
  b.count++;
  return true;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: params.id },
    });
    if (!endpoint || endpoint.userId !== userId) {
      return errorResponse("Endpoint not found", 404);
    }

    if (!endpoint.active) {
      return errorResponse(
        "Endpoint is paused — re-enable it before sending a test event.",
        409
      );
    }

    if (!checkTestRate(endpoint.id)) {
      return errorResponse(
        `Test events are rate-limited to ${TEST_PER_MINUTE} per minute per endpoint.`,
        429
      );
    }

    // Mock payload — shaped exactly like a real message.sent event so
    // the receiver's parsing code gets a realistic workout. Marked
    // with a TEST prefix on message_id / external_id so a receiver
    // that forwards events into a CRM can filter it out trivially.
    const now = new Date();
    const payload = {
      event: "message.sent",
      event_id: "", // filled below from the deterministic helper
      message_id: `test.${endpoint.id}.${now.getTime()}`,
      external_id: "TEST_EVENT",
      phone: "15555550123",
      campaign: null,
      status: "sent",
      reply_text: null,
      timestamp: now.toISOString(),
    };

    // Deterministic eventId so if the user mashes "test" and the first
    // test delivery hasn't yet fired, the second call reuses the same
    // delivery row instead of queuing a dupe. The extra tick in `key`
    // keeps each distinct button press as its own delivery.
    const eventId = computeEventId("test", String(now.getTime()), endpoint.id);
    payload.event_id = eventId;

    const delivery = await prisma.webhookDelivery.create({
      data: {
        eventId,
        endpointId: endpoint.id,
        eventType: "message.sent",
        payload,
        status: "PENDING",
      },
      select: { id: true, eventId: true, status: true, createdAt: true },
    });

    // Fire the inline delivery attempt via waitUntil so the test POST
    // returns immediately; the UI can poll /api/webhooks/deliveries
    // to watch the row transition to DELIVERED or FAILED. If the
    // dispatcher gate is closed (log-only Meta mode), dispatchDelivery
    // still runs — the gate only blocks NEW row creation from
    // unverified Meta events, not delivery of an already-created row
    // the user asked for.
    waitUntil(
      dispatchDelivery(prisma, delivery.id).catch(() => undefined)
    );

    return NextResponse.json({
      ok: true,
      delivery,
      note:
        "Test event queued. Watch the delivery log — the row will move to DELIVERED or FAILED within a few seconds.",
    });
  } catch (err) {
    return handleApiError(err, "POST /api/webhooks/endpoints/[id]/test");
  }
}
