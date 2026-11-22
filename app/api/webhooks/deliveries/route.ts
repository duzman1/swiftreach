// Delivery log for the current user's webhook endpoints.
//
// Scope: deliveries whose parent endpoint belongs to the caller.
// Filters: ?endpointId=... to narrow to a single endpoint; ?status=
// to filter by terminal/pending state.
//
// Paginated by createdAt desc with a cursor (not offset). Offset
// pagination over an append-heavy table like this grows slower with
// list depth; cursor paging is O(1) per page.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const VALID_STATUSES = new Set(["PENDING", "DELIVERED", "FAILED", "DEAD"]);

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);

    const endpointId = url.searchParams.get("endpointId") || undefined;
    const statusParam = url.searchParams.get("status") || undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? PAGE_SIZE);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_PAGE_SIZE)
      : PAGE_SIZE;
    const cursor = url.searchParams.get("cursor") || undefined; // ISO createdAt of the last item on the previous page

    // Verify endpoint ownership BEFORE filtering by it — otherwise an
    // attacker could probe by passing another user's endpointId and
    // observing empty vs. 200. Returns 404 either way.
    if (endpointId) {
      const ep = await prisma.webhookEndpoint.findUnique({
        where: { id: endpointId },
        select: { userId: true },
      });
      if (!ep || ep.userId !== userId) {
        return NextResponse.json({ ok: false, error: "Endpoint not found" }, { status: 404 });
      }
    }

    const where: Prisma.WebhookDeliveryWhereInput = {
      endpoint: { userId },
      ...(endpointId ? { endpointId } : {}),
      ...(statusParam && VALID_STATUSES.has(statusParam) ? { status: statusParam } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const rows = await prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        eventId: true,
        endpointId: true,
        eventType: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastResponseCode: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        // payload intentionally OMITTED on the list view — it can be
        // large, and the UI fetches it from the single-delivery route
        // only when the user expands a row.
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

    return NextResponse.json({
      ok: true,
      deliveries: page,
      nextCursor,
      pageSize: limit,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/webhooks/deliveries");
  }
}
