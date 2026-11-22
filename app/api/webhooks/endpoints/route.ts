// Webhook endpoint CRUD (list + create).
//
// Auth: Clerk session (via middleware). API-key auth is intentionally
// NOT accepted here — these are management operations, not send
// operations. Scoped to the current user's own endpoints.
//
// Create returns the newly-generated secret ONCE, in the create
// response body. The list endpoint never returns secrets — callers
// rotate via POST /api/webhooks/endpoints/[id]/secret if they lose
// theirs.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { validateWebhookUrl } from "@/lib/validateWebhookUrl";
import { WEBHOOK_EVENT_TYPES, isKnownEventType, type WebhookEventType } from "@/lib/webhookEvents";

export const dynamic = "force-dynamic";

// Cap on how many endpoints a single user can register. Keeps the
// fan-out bounded (every emitted event has to create one
// WebhookDelivery row per subscribed endpoint) and signals config
// mistakes — nobody legitimately needs 50 copies of the same hook.
const MAX_ENDPOINTS_PER_USER = 10;

interface CreateBody {
  url?: unknown;
  events?: unknown;
  active?: unknown;
}

function generateSecret(): string {
  // 32 bytes = 64 hex chars. Long enough that brute-forcing the HMAC
  // key is infeasible; short enough to display in a UI code block
  // without wrapping grotesquely.
  return randomBytes(32).toString("hex");
}

function validateEvents(raw: unknown): { ok: true; events: WebhookEventType[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "events must be a non-empty array" };
  }
  const bad = raw.filter((e) => !isKnownEventType(e));
  if (bad.length > 0) {
    return {
      ok: false,
      error: `Unknown event type(s): ${bad.map(String).join(", ")}. Valid: ${WEBHOOK_EVENT_TYPES.join(", ")}`,
    };
  }
  // Dedupe — a user might accidentally list the same event twice and
  // we don't want double-fan-out.
  return { ok: true, events: Array.from(new Set(raw as WebhookEventType[])) };
}

// ── GET — list the current user's endpoints ───────────────────────────
export async function GET() {
  try {
    const userId = await requireUserId();
    const rows = await prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
        // Deliberately NOT selecting `secret`. If a user loses it they
        // rotate; we never echo it back on list.
      },
    });
    return NextResponse.json({ ok: true, endpoints: rows, limit: MAX_ENDPOINTS_PER_USER });
  } catch (err) {
    return handleApiError(err, "GET /api/webhooks/endpoints");
  }
}

// ── POST — register a new endpoint. Returns the secret ONCE. ─────────
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const urlCheck = validateWebhookUrl(body.url);
    if (!urlCheck.ok) return errorResponse(urlCheck.error ?? "Invalid url", 400);

    const eventsCheck = validateEvents(body.events);
    if (!eventsCheck.ok) return errorResponse(eventsCheck.error, 400);

    // active defaults to true; explicit false lets a user register an
    // endpoint in a paused state (useful for staging bring-up).
    const active = body.active === false ? false : true;

    const count = await prisma.webhookEndpoint.count({ where: { userId } });
    if (count >= MAX_ENDPOINTS_PER_USER) {
      return errorResponse(
        `You've hit the ${MAX_ENDPOINTS_PER_USER}-endpoint limit. Delete an unused endpoint to make room.`,
        409
      );
    }

    const secret = generateSecret();
    const created = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url: urlCheck.normalised!,
        secret,
        events: eventsCheck.events,
        active,
      },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // SECRET returned here and ONLY here. The response copy should
    // nudge the caller to store it immediately — we won't show it
    // again (list + detail routes both omit it; rotation generates
    // a new one).
    return NextResponse.json({
      ok: true,
      endpoint: created,
      secret,
      secretNotice:
        "Store this secret now — it's the only time it's shown. Use it to verify the X-SwiftReach-Signature header on incoming events. Lost it? Rotate via POST /api/webhooks/endpoints/{id}/secret.",
    });
  } catch (err) {
    return handleApiError(err, "POST /api/webhooks/endpoints");
  }
}
