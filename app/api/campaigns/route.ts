import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { buildMessage, type FormatRule } from "@/lib/buildMessage";
import { applyFilters, type FilterRule } from "@/lib/applyFilters";
import { buildTemplateComponents, type VariableMapping } from "@/lib/whatsapp";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface CreateCampaignBody {
  name: string;
  mode: "freeform" | "template";
  // Mode A
  rawMessage?: string;
  // Mode B
  templateName?: string;
  templateLanguage?: string;
  variableMap?: VariableMapping[];
  // Both
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
  phoneColumn: string;
  defaultCountryCode?: string;
  delayMs?: number;
  filters?: FilterRule[];
  // Full row data — server pre-computes personalized message per row
  rows: Array<Record<string, string>>;
  // Optional: skip these row indices (after filters applied)
  skippedIndices?: number[];
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

// GET — list campaigns
export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ ok: true, campaigns });
  } catch (err) {
    return handleApiError(err, "GET /api/campaigns");
  }
}

// POST — create a campaign with all contacts pre-baked
export async function POST(req: NextRequest) {
  let body: CreateCampaignBody;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.name?.trim()) return badRequest("Missing campaign name");
  if (body.mode !== "freeform" && body.mode !== "template")
    return badRequest("Invalid mode");
  if (!body.phoneColumn) return badRequest("Missing phoneColumn");
  if (!Array.isArray(body.rows) || body.rows.length === 0)
    return badRequest("No rows provided");

  if (body.mode === "freeform" && !body.rawMessage?.trim()) {
    return badRequest("Mode 'freeform' requires rawMessage");
  }
  if (body.mode === "template" && (!body.templateName || !body.templateLanguage)) {
    return badRequest("Mode 'template' requires templateName and templateLanguage");
  }

  const staticVars = body.staticVars ?? {};
  const formatRules = body.formatRules ?? {};
  const defaultCountryCode = body.defaultCountryCode || "1";
  const delayMs = Math.max(500, Math.min(60000, body.delayMs ?? 2000));
  const filters = body.filters ?? [];

  // Apply filters server-side (don't trust client to have applied them).
  const filteredRows = applyFilters(body.rows, filters);
  const skipped = new Set(body.skippedIndices ?? []);

  // Build contact rows
  const contactsData = filteredRows.map((row, i) => {
    const phoneRaw = row[body.phoneColumn] ?? "";
    const phone = normalizePhone(phoneRaw, defaultCountryCode);
    const phoneValid = isValidPhone(phone);
    const isSkipped = skipped.has(i);

    let personalizedMessage = "";
    if (body.mode === "freeform") {
      personalizedMessage = buildMessage({
        template: body.rawMessage!,
        rowData: row,
        staticVars,
        formatRules,
      });
    } else {
      // For template mode, we don't pre-render text — we store the row data
      // and reconstruct components at send time. Save a human-readable
      // approximation for the UI preview.
      const params = (body.variableMap ?? [])
        .map((m) => {
          if (m.source === "column" && m.column) return row[m.column] ?? "";
          if (m.source === "static") return m.value ?? "";
          return "";
        })
        .map((p, idx) => `{{${idx + 1}}}=${p}`)
        .join(", ");
      personalizedMessage = `[template:${body.templateName}] ${params}`;
    }

    let status: string = "pending";
    if (!phoneValid) status = "invalid";
    else if (isSkipped) status = "skipped";

    return {
      phoneNumber: phone,
      rowData: JSON.stringify(row),
      personalizedMessage,
      status,
    };
  });

  const totalCount = contactsData.length;
  const skippedCount = contactsData.filter(
    (c) => c.status === "skipped" || c.status === "invalid"
  ).length;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name.trim(),
        mode: body.mode,
        templateName: body.templateName,
        rawMessage: body.rawMessage,
        staticVars: JSON.stringify(staticVars),
        variableMap: JSON.stringify(body.variableMap ?? []),
        formatRules: JSON.stringify(formatRules),
        phoneColumn: body.phoneColumn,
        delayMs,
        status: "draft",
        totalCount,
        skippedCount,
        contacts: { create: contactsData },
      },
      select: { id: true, name: true, totalCount: true, skippedCount: true },
    });
    return NextResponse.json({ ok: true, campaign });
  } catch (err) {
    return handleApiError(err, "POST /api/campaigns");
  }
}
