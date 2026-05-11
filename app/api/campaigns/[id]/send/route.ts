import { prisma } from "@/lib/prisma";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendWithRetry,
  buildTemplateComponents,
  DEFAULT_API_VERSION,
  type VariableMapping,
  type WhatsAppCredentials,
} from "@/lib/whatsapp";
import type { FormatRule } from "@/lib/buildMessage";
import { requireUserId } from "@/lib/auth";
import { decrypt } from "@/lib/encrypt";
import { checkMessageLimit, incrementMessageUsage } from "@/lib/usageCheck";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
// Vercel Hobby plan caps function maxDuration at 300s. If you upgrade to Pro,
// you can raise this to 900s. The send loop checks pause/cancel state on each
// iteration, so a single SSE pass can deliver ~150 messages at the default 2s
// delay. For larger campaigns, split into batches via Pause → Resume.
export const maxDuration = 300;

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
  // Auth + ownership before opening the stream.
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  // Admin moderation: a suspended account can't send. Cheap select-only
  // lookup; the full user record is loaded a few lines down anyway.
  const accountState = await prisma.user.findUnique({
    where: { id: userId },
    select: { suspended: true },
  });
  if (accountState?.suspended) {
    return new Response(
      "Your account has been suspended. Please contact support@swiftreach.app.",
      { status: 403 }
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      // The owning user is needed for decrypted Meta credentials.
      user: true,
      contacts: {
        where: { status: "pending" },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!campaign || campaign.userId !== userId) {
    return new Response("Campaign not found", { status: 404 });
  }

  // Decrypt the user's Meta credentials once at stream start. Pass into each
  // sendXxx() call so we use this user's token, not env or another user's.
  const userCreds: WhatsAppCredentials | null = (() => {
    if (!campaign.user) return null;
    const u = campaign.user;
    if (!u.whatsappApiToken || !u.whatsappPhoneNumberId) return null;
    const token = decrypt(u.whatsappApiToken);
    if (!token) return null;
    return {
      apiToken: token,
      phoneNumberId: u.whatsappPhoneNumberId,
      apiVersion: u.whatsappApiVersion ?? DEFAULT_API_VERSION,
    };
  })();

  if (!userCreds) {
    return new Response(
      "Your WhatsApp credentials aren't set. Add them in Settings before sending.",
      { status: 400 }
    );
  }

  // ── Plan-limit pre-check ──────────────────────────────────────────────
  // Refuse to start a send that would exceed the user's monthly allowance.
  // The loop also re-checks per-iteration so a concurrent send (or a paid
  // user whose subscription lapses mid-campaign) doesn't slip through.
  const limitCheck = await checkMessageLimit(userId, campaign.contacts.length);
  if (!limitCheck.allowed) {
    return new Response(limitCheck.reason, { status: 403 });
  }

  // Capture into local consts to keep TS happy inside the stream closure.
  const campaignId: string = campaign.id;
  const campaignMode = campaign.mode;
  const campaignTemplateName = campaign.templateName ?? "";
  const campaignContacts = campaign.contacts;
  const creds = userCreds;
  const userIdLocal = userId;

  // ── Opt-out lookup ────────────────────────────────────────────────────
  // Pull every opted-out phone for this user up front so per-iteration
  // checks are a Set membership test (O(1)) rather than a DB hit per
  // contact. The set is captured into the stream closure.
  const optedOutRows = await prisma.savedContact.findMany({
    where: { userId, optedOut: true },
    select: { phoneNumber: true },
  });
  const optedOutSet = new Set(optedOutRows.map((r) => r.phoneNumber));

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

          // ── Per-iteration plan-limit re-check ────────────────────────────
          // Catches the case where the user has another campaign sending in
          // parallel, or a paid subscription lapsed mid-campaign. Remaining
          // contacts get a "limit_reached" status so the UI can prompt
          // upgrade and the user can retry after upgrading.
          const live = await checkMessageLimit(userIdLocal, 1);
          if (!live.allowed) {
            // Mark THIS contact + everything still pending as limit_reached.
            const remainingIds = contacts.slice(i).map((x) => x.id);
            await prisma.contact.updateMany({
              where: { id: { in: remainingIds } },
              data: {
                status: "limit_reached",
                errorMessage: live.reason,
              },
            });
            emit("limit_reached", {
              processed,
              skipped: remainingIds.length,
              reason: live.reason,
            });
            await finalize("completed");
            close();
            return;
          }

          // ── Opt-out suppression ────────────────────────────────────────
          // If this contact's phone is in the user's opt-out set, mark
          // skipped instead of sending. Counts toward the campaign's
          // skipped tally, not failed.
          if (optedOutSet.has(c.phoneNumber)) {
            await prisma.contact.update({
              where: { id: c.id },
              data: {
                status: "skipped",
                errorMessage: "Contact has opted out",
              },
            });
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { skippedCount: { increment: 1 } },
            });
            processed++;
            emit("progress", {
              index: i + 1,
              total: contacts.length,
              contactId: c.id,
              phone: c.phoneNumber,
              status: "skipped",
              error: "Contact has opted out",
            });
            if (i < contacts.length - 1) {
              await new Promise((r) => setTimeout(r, delayMs));
            }
            continue;
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
                return sendTextMessage(
                  c.phoneNumber,
                  c.personalizedMessage,
                  creds
                );
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
                components,
                creds
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

          if (nextStatus === "sent") {
            sentCount++;
            // Charge against the user's monthly allowance only on success —
            // failed sends don't count.
            await incrementMessageUsage(userIdLocal, 1);
          } else {
            failedCount++;
          }
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
        // Surface to /admin/system → Errors. Best-effort: errorLog.ts
        // swallows its own failures so we don't mask the real issue.
        await logError(`GET /api/campaigns/${campaignId}/send`, err, {
          userId: userIdLocal,
        });
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
