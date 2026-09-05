// Send a reply to an inbox conversation. Uses the same WhatsApp send path
// as the campaign loop (sendWithRetry + sendTextMessage) so rate limiting
// + retry behaviour is identical.
//
// CRITICAL: must check the user's WhatsApp credentials are configured
// before attempting send (per Phase 6 critical rules #3) and check
// suspension state.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { isUserSuspended, suspendedResponse } from "@/lib/suspendCheck";
import { decrypt } from "@/lib/encrypt";
import {
  sendTextMessage,
  sendWithRetry,
  DEFAULT_API_VERSION,
  type WhatsAppCredentials,
} from "@/lib/whatsapp";
import { checkMessageLimit, incrementMessageUsage } from "@/lib/usageCheck";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function loadCreds(userId: string): Promise<WhatsAppCredentials | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !u.whatsappApiToken || !u.whatsappPhoneNumberId) return null;
  const token = decrypt(u.whatsappApiToken);
  if (!token) return null;
  return {
    apiToken: token,
    phoneNumberId: u.whatsappPhoneNumberId,
    apiVersion: u.whatsappApiVersion ?? DEFAULT_API_VERSION,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    if (await isUserSuspended(userId)) return suspendedResponse();

    let body: { messageText?: string };
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }
    const text = body.messageText?.trim();
    if (!text) return bad("messageText is required");

    const inbound = await prisma.inboundMessage.findUnique({ where: { id: params.id } });
    if (!inbound || inbound.userId !== userId) return bad("Message not found", 404);

    // Plan-limit re-check — replies count against the same monthly cap as
    // campaign sends (Phase 6 critical rules #6 + Phase 4 invariant).
    const limit = await checkMessageLimit(userId, 1);
    if (!limit.allowed) {
      return bad(limit.reason ?? "Monthly message limit reached", 403);
    }

    const creds = await loadCreds(userId);
    if (!creds) {
      return bad(
        "Add your WhatsApp credentials in Settings before replying.",
        400
      );
    }

    const result = await sendWithRetry(() =>
      sendTextMessage(inbound.fromPhone, text, creds)
    );

    // Always log the reply attempt — failed replies still help the user
    // see "I tried, here's why it didn't work" in the conversation thread.
    const reply = await prisma.outboundReply.create({
      data: {
        userId,
        inboundMessageId: inbound.id,
        toPhone: inbound.fromPhone,
        messageText: text,
        whatsappMsgId: result.success ? result.messageId : null,
        status: result.success ? "sent" : "failed",
      },
    });

    if (result.success) {
      await incrementMessageUsage(userId, 1);
      await prisma.inboundMessage.update({
        where: { id: inbound.id },
        data: {
          repliedAt: new Date(),
          // Sending a reply implies you've read the conversation — flip
          // the read flag if it wasn't already.
          read: true,
          readAt: inbound.readAt ?? new Date(),
        },
      });
      return NextResponse.json({ ok: true, reply });
    }

    await logError("POST /api/inbox/[id]/reply", new Error(result.error?.message ?? "send failed"), {
      userId,
    });
    return NextResponse.json(
      {
        ok: false,
        error: result.error?.message ?? "Send failed",
        code: result.error?.code,
        reply,
      },
      { status: 502 }
    );
  } catch (err) {
    return handleApiError(err, "POST /api/inbox/[id]/reply");
  }
}
