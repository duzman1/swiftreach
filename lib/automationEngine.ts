// Daily automation runner. Called by the /api/cron/automations
// endpoint once per day at 13:00 UTC (5am–9am across US time
// zones — see cron comment for why that time).
//
// For each active automation, finds contacts whose (month, day)
// match today, filters out ones already messaged this calendar
// year (the double-send guard — see CRITICAL RULES rule 1), and
// sends the automation's configured message via the same helpers
// the campaign send loop uses.
//
// Uses lib/whatsapp.ts helpers (sendTextMessage /
// sendTemplateMessage / buildTemplateComponents) rather than raw
// fetch to graph.facebook.com — same error parsing, same rate-
// limit behaviour, same axios timeouts. Consistency > duplication.

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
import { getMatchingDatesForToday } from "./dateUtils";
import { logError } from "./errorLog";

const INTER_CONTACT_DELAY_MS = 1000;

export interface AutomationRunSummary {
  automationsChecked: number;
  automationsWithMatches: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function runDailyAutomations(): Promise<AutomationRunSummary> {
  const currentYear = new Date().getFullYear();
  const todayDates = getMatchingDatesForToday();

  // Build the OR clause for today's date(s). Handles Feb-28 in a
  // non-leap year matching both Feb 28 AND Feb 29 contacts.
  const dateWhereClauses = todayDates.map((d) => ({
    month: d.month,
    day: d.day,
  }));

  const automations = await prisma.automation.findMany({
    where: { status: "active" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          whatsappApiToken: true,
          whatsappPhoneNumberId: true,
          whatsappApiVersion: true,
          plan: true,
        },
      },
      contacts: {
        where: {
          isActive: true,
          OR: [
            ...dateWhereClauses.map((d) => ({
              month: d.month,
              day: d.day,
              // Double-send guard: never send to the same contact
              // twice in the same calendar year. This is the single
              // most important invariant in the engine.
              OR: [
                { lastSentYear: null },
                { lastSentYear: { lt: currentYear } },
              ],
            })),
          ],
        },
      },
    },
  });

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let automationsWithMatches = 0;

  for (const automation of automations) {
    if (automation.contacts.length === 0) continue;
    automationsWithMatches++;

    // Skip automations whose owner has no working WhatsApp
    // credentials. Log the skip so admins can see it in the error
    // log but never fail the whole cron.
    const {
      whatsappApiToken,
      whatsappPhoneNumberId,
      whatsappApiVersion,
    } = automation.user;

    if (!whatsappApiToken || !whatsappPhoneNumberId) {
      totalSkipped += automation.contacts.length;
      await logError(
        `automationEngine.credsMissing[${automation.id}]`,
        new Error("User has no WhatsApp credentials configured"),
        { userId: automation.user.id, severity: "warning" }
      );
      await recordRun(automation.id, automation.user.id, {
        contactsFound: automation.contacts.length,
        sent: 0,
        failed: 0,
        skipped: automation.contacts.length,
        status: "failed",
        errorMessage: "User has no WhatsApp credentials",
      });
      continue;
    }

    const apiToken = decrypt(whatsappApiToken);
    if (!apiToken) {
      totalSkipped += automation.contacts.length;
      await logError(
        `automationEngine.tokenDecrypt[${automation.id}]`,
        new Error("Could not decrypt WhatsApp API token"),
        { userId: automation.user.id, severity: "warning" }
      );
      await recordRun(automation.id, automation.user.id, {
        contactsFound: automation.contacts.length,
        sent: 0,
        failed: 0,
        skipped: automation.contacts.length,
        status: "failed",
        errorMessage: "Could not decrypt WhatsApp API token",
      });
      continue;
    }

    const creds: WhatsAppCredentials = {
      apiToken,
      phoneNumberId: whatsappPhoneNumberId,
      apiVersion: whatsappApiVersion?.trim() || DEFAULT_API_VERSION,
    };

    const variableMap: VariableMapping[] = automation.variableMap
      ? JSON.parse(automation.variableMap)
      : [];
    const formatRules: Record<string, FormatRule> = {};

    let runSent = 0;
    let runFailed = 0;

    for (let i = 0; i < automation.contacts.length; i++) {
      const contact = automation.contacts[i];
      try {
        const rowData: Record<string, string> = JSON.parse(
          contact.rowData || "{}"
        );

        const result = await sendWithRetry(() => {
          if (automation.mode === "freeform") {
            const message = buildMessage({
              template: automation.message ?? "",
              rowData,
              staticVars: {},
              formatRules,
            });
            return sendTextMessage(contact.phoneNumber, message, creds);
          }

          const components = buildTemplateComponents(
            variableMap,
            rowData,
            {}
          );
          return sendTemplateMessage(
            contact.phoneNumber,
            automation.templateName ?? "",
            automation.templateLanguage ?? "en_US",
            components,
            creds
          );
        });

        if (result.success) {
          await prisma.automationContact.update({
            where: { id: contact.id },
            data: {
              lastSentAt: new Date(),
              lastSentYear: currentYear,
              totalSent: { increment: 1 },
            },
          });
          runSent++;
          totalSent++;
        } else {
          const errMsg = result.error?.message ?? "Unknown send error";
          await logError(
            `automationEngine.sendFail[${automation.id}]`,
            new Error(errMsg),
            { userId: automation.user.id, severity: "warning" }
          );
          runFailed++;
          totalFailed++;
        }
      } catch (err) {
        await logError(
          `automationEngine.contact[${contact.id}]`,
          err,
          { userId: automation.user.id, severity: "warning" }
        );
        runFailed++;
        totalFailed++;
      }

      if (i < automation.contacts.length - 1) {
        await new Promise((r) => setTimeout(r, INTER_CONTACT_DELAY_MS));
      }
    }

    await recordRun(automation.id, automation.user.id, {
      contactsFound: automation.contacts.length,
      sent: runSent,
      failed: runFailed,
      skipped: 0,
      status: runFailed === 0 ? "completed" : "partial",
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: {
        lastRunAt: new Date(),
        totalSent: { increment: runSent },
      },
    });
  }

  return {
    automationsChecked: automations.length,
    automationsWithMatches,
    sent: totalSent,
    failed: totalFailed,
    skipped: totalSkipped,
  };
}

async function recordRun(
  automationId: string,
  userId: string,
  data: {
    contactsFound: number;
    sent: number;
    failed: number;
    skipped: number;
    status: string;
    errorMessage?: string;
  }
) {
  try {
    await prisma.automationRun.create({
      data: {
        automationId,
        userId,
        runDate: new Date(),
        ...data,
      },
    });
  } catch (err) {
    await logError(`automationEngine.recordRun[${automationId}]`, err);
  }
}
