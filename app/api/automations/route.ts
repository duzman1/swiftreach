// GET  — list this user's automations, oldest first (matches the
//        typical UX of "here are the ones I've created")
// POST — create a new automation from the wizard payload. Parses
//        each row's date column, drops rows we can't extract a
//        valid phone or month/day from, and returns a summary
//        so the wizard can show "N added, M skipped".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { parseDateToMonthDay } from "@/lib/dateUtils";
import { getAutomationCapacity } from "@/lib/automationLimits";
import { hasFeature } from "@/lib/plans";
import { classifyAutomationsForPlan } from "@/lib/automationEngine";
import { checkMessageLimit } from "@/lib/usageCheck";
import type { VariableMapping } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: string;
  type?: "birthday" | "anniversary" | "custom_date";
  mode?: "freeform" | "template";
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  variableMap?: VariableMapping[];
  phoneColumn?: string;
  dateColumn?: string;
  defaultCountryCode?: string;
  sendHour?: number;
  sendMinute?: number;
  daysBeforeDate?: number;
  timezone?: string;
  rows?: Array<Record<string, string>>;
}

export async function GET() {
  try {
    const user = await requireUser();
    const automations = await prisma.automation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { contacts: true } },
      },
    });
    const capacity = await getAutomationCapacity(user.id, user.plan);

    // Derived block state — computed at read time so it clears
    // automatically on plan upgrade or on the 1st of next month.
    // The engine uses classifyAutomationsForPlan too, so the UI and
    // the daily runner agree on what "blocked" means.
    // - type_gated:        Starter/Free with a birthday/anniversary
    // - over_count_cap:    beyond the plan's automation cap (post
    //                      downgrade, deterministic keep-oldest)
    // - over_message_limit: owner's messagesUsedThisMonth is at cap
    // Order matters: type/count block from firing at all; the
    // message-limit block affects everyone else uniformly.
    const nonArchived = automations.filter((a) => a.status !== "archived");
    const verdict = classifyAutomationsForPlan(nonArchived, user.plan);
    const limitCheck = await checkMessageLimit(user.id, 1);
    const messageLimitReached = !limitCheck.allowed && !!limitCheck.upgradeRequired;

    const withState = automations.map((a) => {
      let blockReason: string | null = verdict.get(a.id) ?? null;
      if (!blockReason && a.status === "active" && messageLimitReached) {
        blockReason = "over_message_limit";
      }
      // Copy for the "Paused — <reason>" pill in the UI. Kept in
      // the route so the client stays dumb about plan tiers.
      let blockReasonCopy: string | null = null;
      if (blockReason === "type_gated") {
        blockReasonCopy = "Requires Growth plan";
      } else if (blockReason === "over_count_cap") {
        blockReasonCopy = `Over ${user.plan} automation cap`;
      } else if (blockReason === "over_message_limit") {
        blockReasonCopy = "Monthly message limit reached";
      }
      return { ...a, blockReason, blockReasonCopy };
    });

    return NextResponse.json({
      ok: true,
      automations: withState,
      capacity: {
        plan: capacity.plan,
        limit:
          capacity.limit === Number.POSITIVE_INFINITY
            ? null
            : capacity.limit,
        usedCount: capacity.usedCount,
        canCreate: capacity.canCreate,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/automations");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Plan gate — check BEFORE parsing rows so free-tier users
    // don't waste bandwidth uploading contacts we're going to reject.
    const capacity = await getAutomationCapacity(user.id, user.plan);
    if (!capacity.canCreate) {
      if (capacity.limit === 0) {
        return errorResponse(
          "Automations require a paid plan. Upgrade at swiftreach.app/billing",
          403,
          {
            upgradeRequired: true,
            plan: user.plan,
            requiredPlan: "starter",
          }
        );
      }
      // Over their per-plan count cap. The next tier (growth for
      // starter, pro for growth) is what unlocks more.
      const nextTier = user.plan === "starter" ? "growth" : "pro";
      return errorResponse(
        `Your ${user.plan} plan allows up to ${capacity.limit} automation${capacity.limit === 1 ? "" : "s"}. Archive an existing one or upgrade your plan.`,
        403,
        {
          upgradeRequired: true,
          plan: user.plan,
          requiredPlan: nextTier,
          limit: capacity.limit,
        }
      );
    }

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (!body.name?.trim()) return errorResponse("Missing name", 400);
    if (
      body.type !== "birthday" &&
      body.type !== "anniversary" &&
      body.type !== "custom_date"
    ) {
      return errorResponse("Invalid type", 400);
    }
    // Per-type gate: birthday & anniversary require Growth or above.
    // custom_date stays available inside the existing count cap so
    // Starter accounts can still use renewal reminders etc.
    if (
      (body.type === "birthday" || body.type === "anniversary") &&
      !hasFeature(user.plan, "birthdayAutomations")
    ) {
      return errorResponse(
        "Birthday and anniversary automations require Growth or above. Upgrade at swiftreach.app/billing.",
        403,
        {
          upgradeRequired: true,
          plan: user.plan,
          requiredPlan: "growth",
          feature: "birthdayAutomations",
        }
      );
    }
    if (body.mode !== "freeform" && body.mode !== "template") {
      return errorResponse("Invalid mode", 400);
    }
    if (body.mode === "freeform" && !body.message?.trim()) {
      return errorResponse("freeform mode requires message", 400);
    }
    if (body.mode === "template" && !body.templateName?.trim()) {
      return errorResponse("template mode requires templateName", 400);
    }
    if (!body.phoneColumn) return errorResponse("Missing phoneColumn", 400);
    if (!body.dateColumn) return errorResponse("Missing dateColumn", 400);
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return errorResponse("No rows provided", 400);
    }

    const defaultCountryCode = body.defaultCountryCode || "1";
    const sendHour = clampHour(body.sendHour);
    const sendMinute = clampMinute(body.sendMinute);
    const daysBeforeDate = Math.max(0, Math.min(7, body.daysBeforeDate ?? 0));
    const timezone = body.timezone || "America/Los_Angeles";

    // Parse rows. Each row must produce a valid phone AND a valid
    // month/day, otherwise it's skipped. We track skipped rows so
    // the wizard can show "N contacts skipped (invalid date or phone)".
    interface ParsedRow {
      phoneNumber: string;
      name: string | null;
      dateValue: string;
      month: number;
      day: number;
      rowData: string;
    }
    const parsed: ParsedRow[] = [];
    let skippedInvalidPhone = 0;
    let skippedInvalidDate = 0;

    for (const row of body.rows) {
      const phoneRaw = row[body.phoneColumn] ?? "";
      const dateRaw = row[body.dateColumn] ?? "";

      const phone = normalizePhone(phoneRaw, defaultCountryCode);
      if (!isValidPhone(phone)) {
        skippedInvalidPhone++;
        continue;
      }

      const md = parseDateToMonthDay(String(dateRaw));
      if (!md) {
        skippedInvalidDate++;
        continue;
      }

      // Best-effort name pickup — check "Name", "name", "FullName",
      // "Full Name", or the phone column's neighbouring cell.
      const nameKey = Object.keys(row).find((k) =>
        /^(full\s*)?name$/i.test(k)
      );
      const name = nameKey ? String(row[nameKey] ?? "").trim() : null;

      parsed.push({
        phoneNumber: phone,
        name: name || null,
        dateValue: String(dateRaw),
        month: md.month,
        day: md.day,
        rowData: JSON.stringify(row),
      });
    }

    if (parsed.length === 0) {
      return errorResponse(
        "No valid contacts to add. Check the date and phone columns.",
        400,
        {
          skippedInvalidPhone,
          skippedInvalidDate,
        }
      );
    }

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        type: body.type,
        mode: body.mode,
        message: body.mode === "freeform" ? body.message : null,
        templateName: body.mode === "template" ? body.templateName : null,
        templateLanguage:
          body.mode === "template"
            ? (body.templateLanguage || "en_US")
            : "en_US",
        variableMap:
          body.mode === "template" && body.variableMap
            ? JSON.stringify(body.variableMap)
            : null,
        phoneColumn: body.phoneColumn,
        dateColumn: body.dateColumn,
        defaultCountryCode,
        sendHour,
        sendMinute,
        daysBeforeDate,
        timezone,
        contacts: {
          create: parsed.map((p) => ({
            userId: user.id,
            phoneNumber: p.phoneNumber,
            name: p.name,
            dateValue: p.dateValue,
            month: p.month,
            day: p.day,
            rowData: p.rowData,
          })),
        },
      },
      select: { id: true, name: true, type: true, status: true },
    });

    return NextResponse.json({
      ok: true,
      automation,
      contactsAdded: parsed.length,
      skippedInvalidPhone,
      skippedInvalidDate,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/automations");
  }
}

function clampHour(v: number | undefined): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 9;
  return Math.max(0, Math.min(23, Math.floor(v)));
}
function clampMinute(v: number | undefined): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(59, Math.floor(v)));
}
