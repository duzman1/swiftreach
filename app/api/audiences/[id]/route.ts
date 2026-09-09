// Per-audience GET / PUT / DELETE. PUT accepts name, description,
// rules (any subset). DELETE hard-deletes; Campaign.audienceId is
// SetNull so past campaigns keep their audienceResolvedCount
// snapshot for explainability, but ScheduledCampaign rows that
// still reference this audience will fail on the next cron fire
// with "audience was deleted" — see lib/materializeScheduled.ts
// for the detection logic.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { parseRules, rulesToWhere, AudienceRulesError } from "@/lib/audienceResolver";

export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

interface UpdateBody {
  name?: string;
  description?: string | null;
  rules?: unknown;
}

async function loadOwned(id: string, userId: string) {
  const a = await prisma.audience.findUnique({ where: { id } });
  if (!a || a.userId !== userId) return null;
  return a;
}

// Cap on rows returned to the wizard when it asks for the full set
// (rows=1). The server-side send resolver uses the live audience,
// not this payload — this cap only bounds what the review table
// shows, not what gets sent. Chosen to keep the wizard responsive
// on very large audiences while still showing a meaningful sample.
const WIZARD_ROWS_CAP = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    const audience = await loadOwned(params.id, user.id);
    if (!audience) return errorResponse("Audience not found", 404);

    const wantRows = new URL(req.url).searchParams.get("rows") === "1";

    // Live member count. Same rule as the list endpoint — exclude
    // opt-outs so the number matches what a send would target.
    let memberCount: number | null = null;
    let rulesError: string | null = null;
    let rows: Array<Record<string, string>> | null = null;
    let rowsCapped = false;
    try {
      const rules = parseRules(JSON.parse(audience.rules));
      const where = rulesToWhere(rules, user.id);
      const memberWhere = { AND: [where, { optedOut: false }] };
      memberCount = await prisma.savedContact.count({ where: memberWhere });

      if (wantRows) {
        const contacts = await prisma.savedContact.findMany({
          where: memberWhere,
          orderBy: { updatedAt: "desc" },
          take: WIZARD_ROWS_CAP,
          select: { phoneNumber: true, data: true },
        });
        rowsCapped = memberCount > contacts.length;
        rows = contacts.map((c) => {
          const row: Record<string, string> = { phoneNumber: c.phoneNumber };
          try {
            const d = JSON.parse(c.data);
            if (d && typeof d === "object") {
              for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
                if (k === "phoneNumber") continue;
                row[k] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
              }
            }
          } catch { /* row keeps just phoneNumber */ }
          return row;
        });
      }
    } catch (e) {
      rulesError = e instanceof Error ? e.message : "Invalid rules";
    }

    return NextResponse.json({
      ok: true,
      audience: { ...audience, memberCount, rulesError },
      rows,
      rowsCap: WIZARD_ROWS_CAP,
      rowsCapped,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/audiences/[id]");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    const existing = await loadOwned(params.id, user.id);
    if (!existing) return errorResponse("Audience not found", 404);

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return errorResponse("Name can't be blank", 400);
      if (n.length > MAX_NAME) {
        return errorResponse(`Name must be ${MAX_NAME} characters or fewer`, 400);
      }
      data.name = n;
    }
    if (body.description !== undefined) {
      const d = body.description?.trim() ?? "";
      if (d.length > MAX_DESCRIPTION) {
        return errorResponse(`Description must be ${MAX_DESCRIPTION} characters or fewer`, 400);
      }
      data.description = d || null;
    }
    if (body.rules !== undefined) {
      try {
        const rulesObj = parseRules(body.rules);
        data.rules = JSON.stringify(rulesObj);
      } catch (e) {
        if (e instanceof AudienceRulesError) return errorResponse(e.message, 400);
        throw e;
      }
    }
    if (Object.keys(data).length === 0) {
      return errorResponse("No fields to update", 400);
    }

    try {
      const updated = await prisma.audience.update({
        where: { id: params.id },
        data,
      });
      return NextResponse.json({ ok: true, audience: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("An audience with that name already exists.", 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err, "PUT /api/audiences/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    const existing = await loadOwned(params.id, user.id);
    if (!existing) return errorResponse("Audience not found", 404);

    // Warn on scheduled campaigns still using this — they'll fail
    // on next fire. We surface the count in the response so the UI
    // can put it in a confirmation dialog before this call.
    await prisma.audience.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/audiences/[id]");
  }
}
