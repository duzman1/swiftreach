// GET — fetch single inbound message PLUS its outbound replies, for the
// detail panel. DEL — soft remove (hard delete is fine; we don't track
// "trashed" state). Both routes scope to the requesting user.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requirePaidPlan } from "@/lib/planGate";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "inbox");
    if (gate) return gate;

    const message = await prisma.inboundMessage.findUnique({
      where: { id: params.id },
    });
    if (!message || message.userId !== userId) return bad("Message not found", 404);

    const [replies, campaign, savedContact, opted] = await Promise.all([
      prisma.outboundReply.findMany({
        where: { inboundMessageId: params.id },
        orderBy: { sentAt: "asc" },
      }),
      message.campaignId
        ? prisma.campaign.findUnique({
            where: { id: message.campaignId },
            select: { id: true, name: true, mode: true },
          })
        : null,
      prisma.savedContact.findUnique({
        where: {
          userId_phoneNumber: { userId, phoneNumber: message.fromPhone },
        },
      }),
      prisma.optOutLog.findFirst({
        where: { userId, phoneNumber: message.fromPhone },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message,
      replies,
      campaign,
      savedContact,
      optedOut: Boolean(opted),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/inbox/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "inbox");
    if (gate) return gate;

    const existing = await prisma.inboundMessage.findUnique({ where: { id: params.id } });
    if (!existing || existing.userId !== userId) return bad("Message not found", 404);

    await prisma.outboundReply.deleteMany({ where: { inboundMessageId: params.id } });
    await prisma.inboundMessage.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/inbox/[id]");
  }
}
