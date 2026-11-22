// Single webhook endpoint — read / update / delete.
//
// Update accepts any subset of {url, events, active}. Does NOT
// accept secret changes — those go through the dedicated rotate
// route so the UI flow is explicit (and so a careless PATCH can't
// invalidate an in-flight secret by accident).
//
// Delete cascades to WebhookDelivery rows via the schema's
// onDelete:Cascade. In-flight PENDING deliveries for a deleted
// endpoint simply vanish — intentional: if the user doesn't want
// this endpoint any more, they definitely don't want its backlog.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { validateWebhookUrl } from "@/lib/validateWebhookUrl";
import { WEBHOOK_EVENT_TYPES, isKnownEventType, type WebhookEventType } from "@/lib/webhookEvents";

export const dynamic = "force-dynamic";

async function loadOwned(id: string, userId: string) {
  const row = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return row;
}

interface UpdateBody {
  url?: unknown;
  events?: unknown;
  active?: unknown;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const row = await loadOwned(params.id, userId);
    if (!row) return errorResponse("Endpoint not found", 404);
    // Omit the secret from reads — same rule as the list route.
    const { secret: _secret, ...safe } = row;
    void _secret;
    return NextResponse.json({ ok: true, endpoint: safe });
  } catch (err) {
    return handleApiError(err, "GET /api/webhooks/endpoints/[id]");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await loadOwned(params.id, userId);
    if (!existing) return errorResponse("Endpoint not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const data: Record<string, unknown> = {};

    if (body.url !== undefined) {
      const check = validateWebhookUrl(body.url);
      if (!check.ok) return errorResponse(check.error ?? "Invalid url", 400);
      data.url = check.normalised;
    }

    if (body.events !== undefined) {
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return errorResponse("events must be a non-empty array", 400);
      }
      const bad = body.events.filter((e) => !isKnownEventType(e));
      if (bad.length > 0) {
        return errorResponse(
          `Unknown event type(s): ${bad.map(String).join(", ")}. Valid: ${WEBHOOK_EVENT_TYPES.join(", ")}`,
          400
        );
      }
      data.events = Array.from(new Set(body.events as WebhookEventType[]));
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return errorResponse("active must be a boolean", 400);
      }
      data.active = body.active;
      // Re-enabling a previously-auto-disabled endpoint should reset
      // the failure counter; otherwise the next failure instantly
      // trips the auto-disable threshold again.
      if (body.active === true && existing.active === false) {
        data.failureCount = 0;
      }
    }

    if (Object.keys(data).length === 0) {
      return errorResponse("No fields to update", 400);
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: params.id },
      data,
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

    return NextResponse.json({ ok: true, endpoint: updated });
  } catch (err) {
    return handleApiError(err, "PATCH /api/webhooks/endpoints/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await loadOwned(params.id, userId);
    if (!existing) return errorResponse("Endpoint not found", 404);
    await prisma.webhookEndpoint.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/webhooks/endpoints/[id]");
  }
}
