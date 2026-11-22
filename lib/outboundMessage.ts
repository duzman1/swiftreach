// Shared recorder for OutboundMessage — the unified send-ledger that
// backs the outbound-webhook dispatcher.
//
// Every send path (campaign loop, /api/webhooks/trigger,
// /api/messages/send-single, inbox reply) calls recordOutboundMessage
// exactly once per dispatch attempt — success OR failure — so the
// dispatcher reads a complete picture without each site needing to
// know about the WebhookEndpoint tables.
//
// Why "upsert" and not "create":
//   The campaign-send path currently WRITES a Contact row with the
//   wamid at send time, and then the Meta webhook route's own
//   handler races to UPDATE it with the status change. On the tiny
//   chance Meta's callback beats our own create (observed in
//   practice, usually <100ms), the webhook route's updateMany finds
//   nothing to update and the OutboundMessage would briefly carry
//   a stale "sent" state. Upserting on wamid lets either side win
//   the insert — the other side upgrades via nested set. Nullable
//   wamid means failed-before-dispatch rows get their own cuid id.
//
// Keep this file side-effect-only: no fetches, no retries, no
// webhook dispatch. The dispatcher lives in lib/webhookDispatcher.ts
// (Step 4) and reads from here.

import type { Prisma, PrismaClient } from "@prisma/client";

export type OutboundSource =
  | "CAMPAIGN"
  | "TRIGGER"
  | "SINGLE"
  | "REPLY"
  | "AUTOMATION";

export type OutboundStatus = "sent" | "delivered" | "read" | "failed";

export interface RecordArgs {
  userId: string;
  source: OutboundSource;
  phone: string;             // E.164, no leading +
  whatsappMsgId: string | null;  // null when Meta call failed before wamid
  campaignId?: string | null;
  externalId?: string | null;
  status?: OutboundStatus;   // default "sent" on success, caller passes "failed" otherwise
  errorMessage?: string | null;
}

/**
 * Insert (or upsert if the wamid already exists) one OutboundMessage.
 * Returns the row's id so callers can tie it to subsequent work.
 *
 * Callers MUST pass the SAME prisma client they're using for their
 * transaction (when applicable). The inbox-reply site uses this
 * inside a prisma.$transaction to keep OutboundReply and
 * OutboundMessage mirrored atomically.
 */
export async function recordOutboundMessage(
  prisma: PrismaClient | Prisma.TransactionClient,
  args: RecordArgs
): Promise<{ id: string }> {
  const status = args.status ?? "sent";
  const failedAt = status === "failed" ? new Date() : null;

  // wamid is UNIQUE but nullable. For the null case we can't upsert
  // on it (null != null in uniqueness semantics) — just create. For
  // the non-null case, upsert handles the webhook-vs-send race.
  if (args.whatsappMsgId) {
    const row = await prisma.outboundMessage.upsert({
      where: { whatsappMsgId: args.whatsappMsgId },
      create: {
        userId: args.userId,
        source: args.source,
        phone: args.phone,
        whatsappMsgId: args.whatsappMsgId,
        campaignId: args.campaignId ?? null,
        externalId: args.externalId ?? null,
        status,
        errorMessage: args.errorMessage ?? null,
        failedAt,
      },
      // Status monotonicity guard lives in the WEBHOOK path (see
      // app/api/webhook/[userId]/route.ts). Here, if the row already
      // exists because the webhook beat us to it, we only backfill
      // metadata that the webhook couldn't have known (source,
      // campaignId, externalId). We deliberately do NOT overwrite
      // status/deliveredAt/readAt — those belong to Meta.
      update: {
        source: args.source,
        campaignId: args.campaignId ?? null,
        externalId: args.externalId ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  const row = await prisma.outboundMessage.create({
    data: {
      userId: args.userId,
      source: args.source,
      phone: args.phone,
      whatsappMsgId: null,
      campaignId: args.campaignId ?? null,
      externalId: args.externalId ?? null,
      status,
      errorMessage: args.errorMessage ?? null,
      failedAt,
    },
    select: { id: true },
  });
  return row;
}

