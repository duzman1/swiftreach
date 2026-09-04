// Inline retry for failed campaign contacts. Powers both the
// auto-retry cron (/api/cron/retry-failed) and any future manual
// "retry now" flows. Does NOT power the existing manual retry button
// on the campaign detail page — that one uses PUT /retry to reset
// failed→pending and reopens the SSE stream, which is a better UX
// for user-initiated retries (live progress + smart error-mix
// warnings).
//
// The engine:
//   1. Loads the campaign, user credentials, and failed contacts
//      whose retryCount is below maxRetries.
//   2. For each contact, rebuilds the exact same payload the send
//      route would build (freeform via buildMessage, template via
//      buildTemplateComponents) — so retries are byte-identical to
//      originals from Meta's point of view.
//   3. Uses lib/whatsapp.ts helpers (sendTextMessage /
//      sendTemplateMessage) — same axios client, same error parsing,
//      same rate-limit handling as the original send. No raw fetch.
//   4. Updates per-contact status + retryCount + retryStatus.
//   5. Updates campaign-level retriedContactCount / retryDelivered
//      + sentCount for the successful retries + failedCount
//      decrement for the ones that recovered.
//   6. Sleeps 1s between contacts to stay under Meta rate limits.
//
// Idempotency: the auto-retry cron guards with autoRetryRanAt, and
// each contact's retryCount limits how many times ONE row can be
// retried across all invocations.

import { prisma } from "./prisma";
import { decrypt } from "./encrypt";
import { buildMessage, type FormatRule } from "./buildMessage";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendWithRetry,
  buildTemplateComponents,
  DEFAULT_API_VERSION,
  type VariableMapping,
  type WhatsAppCredentials,
} from "./whatsapp";
import { logError } from "./errorLog";

export interface RetryResult {
  contactId: string;
  phoneNumber: string;
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface RetrySummary {
  total: number;
  succeeded: number;
  stillFailed: number;
  results: RetryResult[];
}

const INTER_CONTACT_DELAY_MS = 1000;

export async function retryCampaignFailed(
  campaignId: string,
  maxRetries: number = 1
): Promise<RetrySummary> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      user: {
        select: {
          whatsappApiToken: true,
          whatsappPhoneNumberId: true,
          whatsappApiVersion: true,
        },
      },
      contacts: {
        where: {
          status: "failed",
          retryCount: { lt: maxRetries },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.user)
    throw new Error("Campaign has no owner — cannot retry");

  const {
    whatsappApiToken,
    whatsappPhoneNumberId,
    whatsappApiVersion,
  } = campaign.user;

  if (!whatsappApiToken || !whatsappPhoneNumberId) {
    throw new Error(
      "WhatsApp credentials not configured for this account"
    );
  }

  const failedContacts = campaign.contacts;
  if (failedContacts.length === 0) {
    return { total: 0, succeeded: 0, stillFailed: 0, results: [] };
  }

  const apiToken = decrypt(whatsappApiToken);
  if (!apiToken) {
    throw new Error(
      "Could not decrypt WhatsApp API token — reconnect in Settings"
    );
  }

  const creds: WhatsAppCredentials = {
    apiToken,
    phoneNumberId: whatsappPhoneNumberId,
    apiVersion: whatsappApiVersion?.trim() || DEFAULT_API_VERSION,
  };

  const staticVars: Record<string, string> = JSON.parse(
    campaign.staticVars || "{}"
  );
  const variableMap: VariableMapping[] = JSON.parse(
    campaign.variableMap || "[]"
  );
  const formatRules: Record<string, FormatRule> = JSON.parse(
    campaign.formatRules || "{}"
  );

  const results: RetryResult[] = [];

  for (let i = 0; i < failedContacts.length; i++) {
    const contact = failedContacts[i];
    try {
      const rowData: Record<string, string> = JSON.parse(
        contact.rowData || "{}"
      );

      const result = await sendWithRetry(() => {
        if (campaign.mode === "freeform") {
          const message = buildMessage({
            template: campaign.rawMessage ?? "",
            rowData,
            staticVars,
            formatRules,
          });
          return sendTextMessage(contact.phoneNumber, message, creds);
        }

        const components = buildTemplateComponents(
          variableMap,
          rowData,
          staticVars
        );
        return sendTemplateMessage(
          contact.phoneNumber,
          campaign.templateName ?? "",
          "en_US",
          components,
          creds
        );
      });

      if (result.success) {
        // Recovery! Row transitions failed → sent (webhook may
        // subsequently mark it delivered/read like a normal send).
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            status: "sent",
            whatsappMsgId: result.messageId ?? null,
            sentAt: new Date(),
            errorMessage: null,
            retryCount: { increment: 1 },
            lastRetryAt: new Date(),
            retryStatus: "sent",
          },
        });
        results.push({
          contactId: contact.id,
          phoneNumber: contact.phoneNumber,
          success: true,
          messageId: result.messageId,
        });
      } else {
        // Still failed — keep status=failed, bump retryCount so
        // subsequent runs skip this row once max is reached.
        const errMsg = result.error?.message ?? "Retry failed";
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            errorMessage: errMsg,
            retryCount: { increment: 1 },
            lastRetryAt: new Date(),
            retryStatus: "failed",
          },
        });
        results.push({
          contactId: contact.id,
          phoneNumber: contact.phoneNumber,
          success: false,
          error: errMsg,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Retry threw";
      await logError(`retryEngine[${campaignId}]`, err);
      // Best-effort bookkeeping so a thrown error still counts as a
      // retry attempt (prevents infinite loops from a poison row).
      try {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            errorMessage: msg,
            retryCount: { increment: 1 },
            lastRetryAt: new Date(),
            retryStatus: "failed",
          },
        });
      } catch {
        /* ignore secondary failure */
      }
      results.push({
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        success: false,
        error: msg,
      });
    }

    // Inter-contact delay to stay under Meta rate limits (skip after
    // the last one).
    if (i < failedContacts.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CONTACT_DELAY_MS));
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const stillFailed = results.filter((r) => !r.success).length;

  // Aggregate stats update:
  // - retriedContactCount / retryDelivered are ADDITIVE across
  //   invocations (a campaign retried by cron THEN by user manually
  //   would show cumulative totals). autoRetryRanAt (not set here) is
  //   the cron-idempotency guard — see /api/cron/retry-failed.
  // - sentCount goes UP by succeeded (they moved failed → sent).
  // - failedCount goes DOWN by succeeded for the same reason.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      retriedContactCount: { increment: failedContacts.length },
      retryDelivered: { increment: succeeded },
      sentCount: { increment: succeeded },
      failedCount: { decrement: succeeded },
    },
  });

  return {
    total: failedContacts.length,
    succeeded,
    stillFailed,
    results,
  };
}
