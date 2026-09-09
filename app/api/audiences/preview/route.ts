// Preview endpoint — the builder POSTs a candidate rule set here as
// the user edits and shows the resolved count + a small sample of
// matching contacts. Nothing is saved.
//
// Rate-limited per user per minute so keystroke-level edits (even
// with the client-side debounce) can't hammer the DB. Empty rules
// return a specific 400 with the same message the create route
// would return — the builder can render it inline instead of
// showing "0 contacts" as if the rules were valid.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { parseRules, rulesToWhere, AudienceRulesError } from "@/lib/audienceResolver";

export const dynamic = "force-dynamic";

const SAMPLE_SIZE = 10;

// Per-user token-bucket-ish limiter. Held in module memory (per
// serverless instance) — good enough to defeat a fat-finger loop
// without needing Redis. If real abuse shows up we'd move this to
// a shared counter, but the builder's client-side debounce already
// keeps normal usage well below the cap.
const REQUESTS_PER_MINUTE = 30;
const rateWindow = new Map<string, { count: number; resetAt: number }>();

function checkRate(userId: string): boolean {
  const now = Date.now();
  const entry = rateWindow.get(userId);
  if (!entry || entry.resetAt < now) {
    rateWindow.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= REQUESTS_PER_MINUTE) return false;
  entry.count++;
  return true;
}

interface Body {
  rules?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "savedAudiences");
    if (gate) return gate;

    if (!checkRate(user.id)) {
      return errorResponse(
        `Preview is rate-limited to ${REQUESTS_PER_MINUTE} requests per minute.`,
        429
      );
    }

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    let rulesObj;
    try {
      rulesObj = parseRules(body.rules);
    } catch (e) {
      if (e instanceof AudienceRulesError) return errorResponse(e.message, 400);
      throw e;
    }

    const where = rulesToWhere(rulesObj, user.id);
    // Exclude opt-outs — matches what a send would target, so the
    // "N contacts will receive this" number the builder shows is
    // the same N the send-time resolver would compute.
    const memberWhere = { AND: [where, { optedOut: false }] };

    const [count, sample] = await Promise.all([
      prisma.savedContact.count({ where: memberWhere }),
      prisma.savedContact.findMany({
        where: memberWhere,
        orderBy: { updatedAt: "desc" },
        take: SAMPLE_SIZE,
        select: {
          id: true,
          phoneNumber: true,
          data: true,
          client: { select: { id: true, name: true, color: true } },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      count,
      sample,
      sampleSize: SAMPLE_SIZE,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/audiences/preview");
  }
}
