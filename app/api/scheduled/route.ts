// Scheduled campaigns CRUD — list + create.
//
// Create accepts the same payload shape as POST /api/campaigns plus the
// scheduling fields (scheduledFor, timezone, recurring, recurrence,
// recurrenceDay). The contact rows are stored verbatim as JSON in
// contactListData so the cron has everything it needs at fire time
// without re-running CSV parsing.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { isUserSuspended, suspendedResponse } from "@/lib/suspendCheck";
import { requirePaidPlan } from "@/lib/planGate";
import type { VariableMapping } from "@/lib/whatsapp";
import type { FormatRule } from "@/lib/buildMessage";

export const dynamic = "force-dynamic";

interface CreateScheduledBody {
  name: string;
  mode: "freeform" | "template";
  rawMessage?: string;
  templateName?: string;
  templateLanguage?: string;
  variableMap?: VariableMapping[];
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
  phoneColumn: string;
  delayMs?: number;
  contacts: Array<Record<string, string>>;
  scheduledFor: string; // ISO
  timezone?: string;
  recurring?: boolean;
  recurrence?: "daily" | "weekly" | "monthly" | null;
  recurrenceDay?: number | null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "scheduled_campaigns");
    if (gate) return gate;
    const list = await prisma.scheduledCampaign.findMany({
      where: { userId },
      orderBy: { scheduledFor: "asc" },
    });
    return NextResponse.json({ ok: true, scheduled: list });
  } catch (err) {
    return handleApiError(err, "GET /api/scheduled");
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const gate = await requirePaidPlan(userId, "scheduled_campaigns");
    if (gate) return gate;
    if (await isUserSuspended(userId)) return suspendedResponse();

    let body: CreateScheduledBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    if (!body.name?.trim()) return bad("Missing campaign name");
    if (body.mode !== "freeform" && body.mode !== "template") return bad("Invalid mode");
    if (!body.phoneColumn) return bad("Missing phoneColumn");
    if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
      return bad("contacts[] is required and must be non-empty");
    }
    if (body.mode === "freeform" && !body.rawMessage?.trim()) {
      return bad("Mode 'freeform' requires rawMessage");
    }
    if (body.mode === "template" && !body.templateName) {
      return bad("Mode 'template' requires templateName");
    }

    const scheduledFor = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return bad("scheduledFor is not a valid date");
    }
    // We allow scheduling within the next minute — the cron runs every
    // minute, so anything earlier would be missed. Don't allow the past.
    if (scheduledFor.getTime() < Date.now() - 60_000) {
      return bad("scheduledFor must be in the future");
    }

    const recurring = Boolean(body.recurring);
    const recurrence = recurring
      ? body.recurrence === "daily" || body.recurrence === "weekly" || body.recurrence === "monthly"
        ? body.recurrence
        : null
      : null;
    if (recurring && !recurrence) {
      return bad("Recurring campaigns require a recurrence (daily | weekly | monthly)");
    }

    const created = await prisma.scheduledCampaign.create({
      data: {
        userId,
        name: body.name.trim(),
        mode: body.mode,
        templateName: body.templateName ?? null,
        rawMessage: body.rawMessage ?? null,
        staticVars: JSON.stringify(body.staticVars ?? {}),
        variableMap: JSON.stringify(body.variableMap ?? []),
        formatRules: JSON.stringify(body.formatRules ?? {}),
        phoneColumn: body.phoneColumn,
        delayMs: Math.max(500, Math.min(60000, body.delayMs ?? 2000)),
        contactListData: JSON.stringify(body.contacts),
        status: "scheduled",
        scheduledFor,
        timezone: body.timezone || "America/Los_Angeles",
        recurring,
        recurrence,
        recurrenceDay: recurring ? body.recurrenceDay ?? null : null,
        nextRunAt: scheduledFor,
      },
    });

    return NextResponse.json({ ok: true, scheduled: created });
  } catch (err) {
    return handleApiError(err, "POST /api/scheduled");
  }
}
