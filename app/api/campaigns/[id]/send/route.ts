import { prisma } from "@/lib/prisma";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendWithRetry,
  buildTemplateComponents,
  type VariableMapping,
} from "@/lib/whatsapp";
import type { FormatRule } from "@/lib/buildMessage";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 min ceiling per send pass

// Server-Sent Events stream that walks the campaign's pending contacts and
// sends them one at a time, with the configured delay between sends.
//
// Event types:
//   started       { total }
//   progress      { index, total, contactId, phone, status, messageId?, error? }
//   paused        { processed }
//   cancelled     { processed }
//   completed     { sent, failed, skipped }
//   error         { message }
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      contacts: {
        where: { status: "pending" },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!campaign) {
    return new Response("Campaign not found", { status: 404 });
  }

  // Capture into local consts to keep TS happy inside the stream closure.
  const campaignId: string = campaign.id;
  const campaignMode = campaign.mode;
  const campaignTemplateName = campaign.templateName ?? "";
  const campaignContacts = campaign.contacts;

  // Mark sending start
  await prisma.campaign.update({
    where: { id: params.id },
    data: { status: "sending" },
  });

  const staticVars: Record<string, string> = JSON.parse(
    campaign.staticVars || "{}"
  );
  const variableMap: VariableMapping[] = JSON.parse(
    campaign.variableMap || "[]"
  );
  // formatRules already applied at create-time for freeform; kept for completeness.
  const _formatRules: Record<string, FormatRule> = JSON.parse(
    campaign.formatRules || "{}"
  );

  const encoder = new TextEncoder();
  const delayMs = campaign.delayMs ?? 2000;

  const stream = new ReadableStream({
    async start(controller) {
      function emit(type: string, data: Record<string, unknown>) {
        const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      function close() {
        try { controller.close(); } catch { /* already closed */ }
      }

      try {
        const contacts = campaignContacts;
        emit("started", { total: contacts.length, campaignId });

        let sentCount = 0;
        let failedCount = 0;
        let processed = 0;

        for (let i = 0; i < contacts.length; i++) {
          const c = contacts[i];

          // Check pause/cancel state every iteration
          const fresh = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { status: true },
          });
          if (!fresh || fresh.status === "cancelled") {
            emit("cancelled", { processed });
            await finalize("cancelled");
            close();
            return;
          }
          if (fresh.status === "paused") {
            emit("paused", { processed });
            close();
            return;
          }

          await prisma.contact.update({
            where: { id: c.id },
            data: { status: "sending" },
          });

          // ── Send ──
          let messageId: string | undefined;
          let errorMsg: string | undefined;
          let nextStatus: "sent" | "failed" = "failed";

          try {
            const rowData: Record<string, string> = JSON.parse(c.rowData || "{}");

            const result = await sendWithRetry(() => {
              if (campaignMode === "freeform") {
                return sendTextMessage(c.phoneNumber, c.personalizedMessage);
              }
              const components = buildTemplateComponents(
                variableMap,
                rowData,
                staticVars
              );
              return sendTemplateMessage(
                c.phoneNumber,
                campaignTemplateName,
                "en_US",
                components
              );
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

          if (nextStatus === "sent") sentCount++;
          else failedCount++;
          processed++;

          // Update campaign aggregates
          await prisma.campaign.update({
            where: { id: campaignId },
            data: {
              sentCount: { increment: nextStatus === "sent" ? 1 : 0 },
              failedCount: { increment: nextStatus === "failed" ? 1 : 0 },
            },
          });

          emit("progress", {
            index: i + 1,
            total: contacts.length,
            contactId: c.id,
            phone: c.phoneNumber,
            status: nextStatus,
            messageId,
            error: errorMsg,
          });

          // Inter-message delay (skip after the last one)
          if (i < contacts.length - 1) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }

        emit("completed", {
          sent: sentCount,
          failed: failedCount,
          skipped: 0,
        });
        await finalize("completed");
      } catch (err) {
        emit("error", {
          message: err instanceof Error ? err.message : "Stream error",
        });
        await finalize("failed");
      } finally {
        close();
      }

      async function finalize(status: string) {
        try {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: {
              status: status === "completed" ? "completed" : status,
              completedAt: status !== "paused" ? new Date() : null,
            },
          });
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
