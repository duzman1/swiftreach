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
import { hasFeature, getLimit } from "./plans";
import { checkMessageLimit, incrementMessageUsage } from "./usageCheck";

const INTER_CONTACT_DELAY_MS = 1000;

export interface AutomationRunSummary {
  automationsChecked: number;
  automationsWithMatches: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Reasons the engine can refuse to run an automation. Same values
 * surfaced by the /api/automations list route so the UI shows a
 * consistent "Paused — <reason>" pill.
 */
export type AutomationBlockReason =
  | "type_gated"
  | "over_count_cap"
  | "over_message_limit";

/**
 * Decide which automations a user is currently allowed to run under
 * their CURRENT plan. Pure function — plan/type/order-only, no DB
 * calls, no message-limit lookups. Called by both the engine and the
 * /api/automations list route so their notions of "blocked" agree.
 *
 * Rules:
 *   1. Filter out birthday/anniversary types when the plan doesn't
 *      have the birthdayAutomations feature (Growth+).
 *   2. Of what remains, order by createdAt ascending and keep the
 *      first N where N = getLimit(plan, "automations"). Deterministic
 *      so the same automations run each day rather than an arbitrary
 *      subset after a downgrade.
 *
 * Returns a Map<automationId, blockReason | null>. A null value
 * means "allowed to run"; a non-null value is the reason it's blocked.
 */
export function classifyAutomationsForPlan<
  T extends { id: string; type: string; createdAt: Date }
>(
  automations: T[],
  plan: string
): Map<string, AutomationBlockReason | null> {
  const result = new Map<string, AutomationBlockReason | null>();

  // Step 1 — mark type-gated ones.
  const typeAllowed: T[] = [];
  for (const a of automations) {
    if (
      (a.type === "birthday" || a.type === "anniversary") &&
      !hasFeature(plan, "birthdayAutomations")
    ) {
      result.set(a.id, "type_gated");
    } else {
      typeAllowed.push(a);
    }
  }

  // Step 2 — deterministic count-cap over what's left.
  const limit = getLimit(plan, "automations");
  const effective =
    limit === null ? Number.POSITIVE_INFINITY : limit ?? 0;
  const sorted = [...typeAllowed].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  sorted.forEach((a, i) => {
    result.set(a.id, i < effective ? null : "over_count_cap");
  });

  return result;
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

  // Pull EVERY active automation (with owner + today's matching
  // contacts). We compute plan gates in TypeScript below so both
  // birthday-gating and count-capping stay consistent with the
  // list-route logic in classifyAutomationsForPlan.
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

  // Per-owner: classify every automation as allowed OR blocked by
  // (a) type gate or (b) deterministic count cap. Even automations
  // that don't have matching contacts today go through this so the
  // cap counts ALL of a user's automations, not just today's active
  // ones — otherwise "top 2 by createdAt" would be unstable day to
  // day.
  const allAutomationsByUser = await prisma.automation.findMany({
    where: {
      status: { not: "archived" },
      userId: { in: [...new Set(automations.map((a) => a.user.id))] },
    },
    select: { id: true, userId: true, type: true, createdAt: true },
  });
  const allowedIds = new Set<string>();
  const grouped = new Map<
    string,
    { plan: string; rows: typeof allAutomationsByUser }
  >();
  for (const a of automations) {
    const existing = grouped.get(a.user.id);
    if (!existing) {
      grouped.set(a.user.id, { plan: a.user.plan, rows: [] });
    }
  }
  for (const row of allAutomationsByUser) {
    const g = grouped.get(row.userId);
    if (g) g.rows.push(row);
  }
  for (const { plan, rows } of grouped.values()) {
    const verdict = classifyAutomationsForPlan(rows, plan);
    for (const [id, blockReason] of verdict) {
      if (blockReason === null) allowedIds.add(id);
    }
  }

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let automationsWithMatches = 0;

  for (const automation of automations) {
    if (automation.contacts.length === 0) continue;

    // Owner's current plan no longer permits this automation —
    // either the type is gated (Starter with a birthday) or it's
    // beyond the current count cap (Starter → Free with any). Skip
    // the whole run and record it so admins can see why.
    if (!allowedIds.has(automation.id)) {
      totalSkipped += automation.contacts.length;
      await recordRun(automation.id, automation.user.id, {
        contactsFound: automation.contacts.length,
        sent: 0,
        failed: 0,
        skipped: automation.contacts.length,
        status: "blocked",
        errorMessage:
          "Skipped — owner's plan no longer permits this automation",
      });
      continue;
    }

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
    let runSkippedByLimit = 0;
    let stoppedByLimit = false;

    for (let i = 0; i < automation.contacts.length; i++) {
      const contact = automation.contacts[i];

      // Per-recipient message-limit check. Even a birthday send
      // costs one message and must count against the owner's
      // monthly cap. If we're over, stop this automation's run —
      // the remaining recipients don't get contacted today. The
      // double-send guard (lastSentYear) still protects them from
      // being re-messaged next year.
      const capCheck = await checkMessageLimit(automation.user.id, 1);
      if (!capCheck.allowed) {
        stoppedByLimit = true;
        runSkippedByLimit = automation.contacts.length - i;
        totalSkipped += runSkippedByLimit;
        break;
      }

      try {
        const rowData: Record<string, string> = JSON.parse(
          contact.rowData || "{}"
        );

        // sendWithRetry re-invokes the send fn on retriable failures
        // (429 / 5xx) with backoff, but returns exactly ONE SendResult
        // to us — so incrementMessageUsage below runs at most once per
        // recipient, regardless of retry attempts. Non-retriable
        // failures (4xx auth/param errors) return the first failure
        // and we count zero messages against the user.
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
          // Only successful sends charge against the user's cap —
          // matches campaign send-loop behaviour in
          // app/api/campaigns/[id]/send/route.ts.
          await incrementMessageUsage(automation.user.id, 1);
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

    const runStatus = stoppedByLimit
      ? "limit_reached"
      : runFailed === 0
        ? "completed"
        : "partial";
    await recordRun(automation.id, automation.user.id, {
      contactsFound: automation.contacts.length,
      sent: runSent,
      failed: runFailed,
      skipped: runSkippedByLimit,
      status: runStatus,
      errorMessage: stoppedByLimit
        ? `Monthly message limit reached — stopped after ${runSent} sends, ${runSkippedByLimit} skipped`
        : undefined,
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
