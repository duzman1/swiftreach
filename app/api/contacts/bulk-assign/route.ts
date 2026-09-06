// Bulk-assign a client label to N contacts at once. Pro only.
//
// Body: { contactIds: string[], clientId: string | null }
//   clientId=null clears the label on all listed contacts.
//   clientId=<id> assigns; must be an owned, non-archived client.
//
// Scoping: the update is filtered by { userId } so a caller can't
// modify contacts that aren't theirs — an attacker sending someone
// else's contactIds silently updates zero rows.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { hasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

const MAX_BULK = 500;

interface Body {
  contactIds?: string[];
  clientId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
      return errorResponse("contactIds[] is required", 400);
    }
    if (body.contactIds.length > MAX_BULK) {
      return errorResponse(`Bulk assign is capped at ${MAX_BULK} contacts per call.`, 400);
    }
    if (body.clientId === undefined) {
      return errorResponse("clientId is required (use null to clear)", 400);
    }

    if (body.clientId !== null) {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      });
      if (!hasFeature(owner?.plan, "perClientReporting")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Per-client reporting requires the Pro plan.",
            upgradeRequired: true,
            requiredPlan: "pro",
          },
          { status: 403 }
        );
      }
      const client = await prisma.client.findUnique({ where: { id: body.clientId } });
      if (!client || client.userId !== userId) {
        return errorResponse("Client not found", 404);
      }
      if (client.archived) {
        return errorResponse("Cannot assign an archived client. Unarchive it first.", 400);
      }
    }

    // updateMany scoped by userId — no cross-user leakage.
    const result = await prisma.savedContact.updateMany({
      where: { userId, id: { in: body.contactIds } },
      data: { clientId: body.clientId },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (err) {
    return handleApiError(err, "POST /api/contacts/bulk-assign");
  }
}
