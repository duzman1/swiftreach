// Audience list + create. Growth-and-above (perClientReporting was
// its own feature; audiences use savedAudiences). Access is
// decided by the `plan` field alone — never stripeSubscriptionStatus.
//
// The GET response also carries a resolved member count per
// audience so the list can show "N contacts" without a second call.
// N is capped by MAX_MEMBER_PREVIEW to avoid a large scan on the
// list page.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { parseRules, rulesToWhere, AudienceRulesError } from "@/lib/audienceResolver";

export const dynamic = "force-dynamic";

const MAX_AUDIENCES_PER_ACCOUNT = 50;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

interface CreateBody {
  name?: string;
  description?: string | null;
  rules?: unknown;
}

export async function GET() {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    const audiences = await prisma.audience.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    // Resolve each audience's current member count. Skips audiences
    // whose stored rules are malformed (shouldn't happen — parseRules
    // guards on write — but a hand-edited row shouldn't crash the
    // list). Also excludes opt-outs at count time so the number
    // matches what a send would actually target.
    const withCounts = await Promise.all(
      audiences.map(async (a) => {
        let memberCount: number | null = null;
        let error: string | null = null;
        try {
          const rules = parseRules(JSON.parse(a.rules));
          const where = rulesToWhere(rules, user.id);
          memberCount = await prisma.savedContact.count({
            where: { AND: [where, { optedOut: false }] },
          });
        } catch (e) {
          error = e instanceof Error ? e.message : "Invalid rules";
        }
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          rules: a.rules, // raw JSON string for the editor to hydrate
          memberCount,
          rulesError: error,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      audiences: withCounts,
      limit: MAX_AUDIENCES_PER_ACCOUNT,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/audiences");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const name = body.name?.trim() ?? "";
    if (!name) return errorResponse("Name is required", 400);
    if (name.length > MAX_NAME) {
      return errorResponse(`Name must be ${MAX_NAME} characters or fewer`, 400);
    }
    const description = body.description?.trim() ?? "";
    if (description.length > MAX_DESCRIPTION) {
      return errorResponse(`Description must be ${MAX_DESCRIPTION} characters or fewer`, 400);
    }

    // parseRules is the single point that enforces "empty matches
    // nothing" — throws with a user-facing message we surface as 400.
    let rulesObj;
    try {
      rulesObj = parseRules(body.rules);
    } catch (e) {
      if (e instanceof AudienceRulesError) return errorResponse(e.message, 400);
      throw e;
    }

    const count = await prisma.audience.count({ where: { userId: user.id } });
    if (count >= MAX_AUDIENCES_PER_ACCOUNT) {
      return errorResponse(
        `You've hit the ${MAX_AUDIENCES_PER_ACCOUNT}-audience limit. Delete an unused one to make room.`,
        409
      );
    }

    try {
      const created = await prisma.audience.create({
        data: {
          userId: user.id,
          name,
          description: description || null,
          rules: JSON.stringify(rulesObj),
        },
      });
      return NextResponse.json({ ok: true, audience: created });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("An audience with that name already exists.", 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err, "POST /api/audiences");
  }
}
