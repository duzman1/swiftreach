import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { buildMessage, type FormatRule } from "@/lib/buildMessage";
import { applyFilters, type FilterRule } from "@/lib/applyFilters";
import { type VariableMapping } from "@/lib/whatsapp";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { hasFeature } from "@/lib/plans";

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
  // Optional per-client label. Explicit values from the builder win
  // over the auto-detected unanimous-recipient-client (that
  // detection happens client-side; server just accepts what it's
  // sent). Pro-only; ignored on non-Pro plans without erroring.
  clientId?: string | null;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

// GET — list the current user's campaigns. Accepts ?clientId= to
// narrow the list to a single client, or ?clientId=unassigned for
// campaigns with no label.
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const raw = url.searchParams.get("clientId");
    const clientFilter =
      raw === "unassigned"
        ? { clientId: null }
        : raw
          ? { clientId: raw }
          : {};
    const campaigns = await prisma.campaign.findMany({
      where: { userId, ...clientFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { client: { select: { id: true, name: true, color: true } } },
    });
    return NextResponse.json({ ok: true, campaigns });
  } catch (err) {
    return handleApiError(err, "GET /api/campaigns");
  }
}

// POST — create a campaign with all contacts pre-baked
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    return handleApiError(err, "POST /api/campaigns");
  }

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

  // Resolve + validate the client label, if one was sent. A Pro user
  // sending a foreign or archived client id gets 400 (loud, so the
  // builder can surface it) rather than silently dropped.
  let clientId: string | null = null;
  if (body.clientId) {
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!hasFeature(owner?.plan, "perClientReporting")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Per-client reporting requires the Pro plan.",
          upgradeRequired: true,
          requiredPlan: "pro",
        },
        { status: 403 }
      );
    }
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client || client.userId !== userId) {
      return badRequest("Client not found");
    }
    if (client.archived) {
      return badRequest("Cannot assign an archived client. Unarchive it first.");
    }
    clientId = client.id;
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
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
        clientId,
        contacts: { create: contactsData },
      },
      select: { id: true, name: true, totalCount: true, skippedCount: true, clientId: true },
    });
    return NextResponse.json({ ok: true, campaign });
  } catch (err) {
    return handleApiError(err, "POST /api/campaigns");
  }
}
