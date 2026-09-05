// Headless campaign send loop. Same per-iteration logic as the SSE route at
// /api/campaigns/[id]/send, minus the SSE emit() calls. Used by the cron
// (POST /api/cron/send-scheduled) so scheduled campaigns can fire without
// a browser session.
//
// Honours the same kill switches: campaign.status === "paused" / "cancelled"
// pauses/aborts mid-loop. Plan limits are re-checked per iteration.
//
// IMPORTANT: this function does NOT decrypt user credentials — the caller
// must pass `creds` ready-to-use. We never want to decrypt tokens unless
// strictly necessary, and the caller is in a better position to bail
// early if creds aren't configured.

import type { PrismaClient } from "@prisma/client";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendWithRetry,
  buildTemplateComponents,
  type WhatsAppCredentials,
  type VariableMapping,
} from "./whatsapp";
import { checkMessageLimit, incrementMessageUsage } from "./usageCheck";
import { logError } from "./errorLog";

interface RunOptions {
  /** Soft cap on wall-clock time in ms. Loop exits cleanly when exceeded
   * so the function returns before Vercel's hard cap (900s on Pro).
   * The campaign stays in "sending" status; a future cron tick can
   * resume by selecting still-pending contacts. */
  maxRuntimeMs?: number;
}

interface RunResult {
  sent: number;
  failed: number;
  skipped: number;
  status: "completed" | "paused" | "cancelled" | "limit_reached" | "interrupted" | "failed";
  reason?: string;
}

export async function runCampaignSend(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
  creds: WhatsAppCredentials,
  opts: RunOptions = {}
): Promise<RunResult> {
  const startedAt = Date.now();
  const maxRuntimeMs = opts.maxRuntimeMs ?? 870_000; // leave ~30s buffer under Vercel Pro 900s.

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return { sent: 0, failed: 0, skipped: 0, status: "failed", reason: "Campaign not found" };
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });

  const staticVars: Record<string, string> = JSON.parse(campaign.staticVars || "{}");
  const variableMap: VariableMapping[] = JSON.parse(campaign.variableMap || "[]");
  const delayMs = campaign.delayMs ?? 2000;
  const mode = campaign.mode;
  const templateName = campaign.templateName ?? "";

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Re-select pending contacts each tick so we naturally resume where we
  // left off if a previous run stopped early.
  const contacts = await prisma.contact.findMany({
    where: { campaignId, status: "pending" },
    orderBy: { id: "asc" },
  });

  for (let i = 0; i < contacts.length; i++) {
    if (Date.now() - startedAt > maxRuntimeMs) {
      // Don't flip status — leave as "sending" so the next cron tick can
      // pick up the rest. Caller decides what to surface.
      return { sent, failed, skipped, status: "interrupted" };
    }

    const c = contacts[i];

    // Honour pause/cancel toggles set from the UI.
    const fresh = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!fresh || fresh.status === "cancelled") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "cancelled", completedAt: new Date() },
      });
      return { sent, failed, skipped, status: "cancelled" };
    }
    if (fresh.status === "paused") {
      return { sent, failed, skipped, status: "paused" };
    }

    // Per-iteration plan-limit re-check — same as the SSE route. Mark all
    // remaining as limit_reached and bail.
    const live = await checkMessageLimit(userId, 1);
    if (!live.allowed) {
      const remainingIds = contacts.slice(i).map((x) => x.id);
      await prisma.contact.updateMany({
        where: { id: { in: remainingIds } },
        data: { status: "limit_reached", errorMessage: live.reason },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", completedAt: new Date() },
      });
      return { sent, failed, skipped: skipped + remainingIds.length, status: "limit_reached", reason: live.reason };
    }

    await prisma.contact.update({ where: { id: c.id }, data: { status: "sending" } });

    let messageId: string | undefined;
    let errorMsg: string | undefined;
    let nextStatus: "sent" | "failed" = "failed";

    try {
      const rowData: Record<string, string> = JSON.parse(c.rowData || "{}");
      const result = await sendWithRetry(() => {
        if (mode === "freeform") {
          return sendTextMessage(c.phoneNumber, c.personalizedMessage, creds);
        }
        const components = buildTemplateComponents(variableMap, rowData, staticVars);
        return sendTemplateMessage(c.phoneNumber, templateName, "en_US", components, creds);
      });
      if (result.success) {
        nextStatus = "sent";
        messageId = result.messageId;
      } else {
        nextStatus = "failed";
        errorMsg = result.error?.message ?? "Unknown error";
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Send threw";
    }

    await prisma.contact.update({
      where: { id: c.id },
      data: {
        status: nextStatus,
        whatsappMsgId: messageId,
        errorMessage: errorMsg,
        sentAt: nextStatus === "sent" ? new Date() : null,
      },
    });

    if (nextStatus === "sent") {
      sent++;
      await incrementMessageUsage(userId, 1);
    } else {
      failed++;
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: nextStatus === "sent" ? 1 : 0 },
        failedCount: { increment: nextStatus === "failed" ? 1 : 0 },
      },
    });

    if (i < contacts.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "completed", completedAt: new Date() },
  });

  return { sent, failed, skipped, status: "completed" };
}

// Convenience: surface logs to /admin/system without crashing the loop.
export async function runCampaignSendSafe(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
  creds: WhatsAppCredentials,
  opts?: RunOptions
): Promise<RunResult> {
  try {
    return await runCampaignSend(prisma, campaignId, userId, creds, opts);
  } catch (err) {
    await logError(`runCampaignSend ${campaignId}`, err, { userId });
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      status: "failed",
      reason: err instanceof Error ? err.message : "send threw",
    };
  }
}
