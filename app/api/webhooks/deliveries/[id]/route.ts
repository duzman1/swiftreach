// Single delivery read — includes the full payload JSON. Used by the
// delivery-log UI when the user expands a row to inspect what was
// actually POSTed (and what Meta sent back).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    // Join on endpoint to scope — delivery itself has no userId column;
    // ownership lives on the parent WebhookEndpoint row.
    const row = await prisma.webhookDelivery.findUnique({
      where: { id: params.id },
      include: {
        endpoint: { select: { userId: true, url: true } },
      },
    });
    if (!row || row.endpoint.userId !== userId) {
      return errorResponse("Delivery not found", 404);
    }
    // Strip the cross-tenant check field from the returned shape.
    const { endpoint, ...rest } = row;
    return NextResponse.json({
      ok: true,
      delivery: { ...rest, endpointUrl: endpoint.url },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/webhooks/deliveries/[id]");
  }
}
