// Rotate an endpoint's signing secret.
//
// Dedicated route (rather than a field on PATCH) so the UI flow is
// explicit — the "Rotate secret" button has a confirm dialog, and
// the new secret is only shown in this response body. A caller that
// loses the response has to rotate again; there's no way to retrieve
// the current secret.
//
// Rotation effect on in-flight deliveries: any WebhookDelivery
// retried AFTER this call is signed with the new secret. The caller's
// receiver needs to accept the new secret BEFORE we rotate, or they'll
// start 401'ing our retries — which is why the UI should show a
// confirmation step.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.webhookEndpoint.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.userId !== userId) {
      return errorResponse("Endpoint not found", 404);
    }

    const newSecret = randomBytes(32).toString("hex");
    await prisma.webhookEndpoint.update({
      where: { id: params.id },
      data: { secret: newSecret },
    });

    return NextResponse.json({
      ok: true,
      secret: newSecret,
      secretNotice:
        "New secret stored. Future webhook deliveries (incl. retries of pending ones) are signed with this value. Update your receiver's secret before expecting more events.",
    });
  } catch (err) {
    return handleApiError(err, "POST /api/webhooks/endpoints/[id]/secret");
  }
}
