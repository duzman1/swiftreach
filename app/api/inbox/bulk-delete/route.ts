// Bulk-delete inbox conversations.
//
// Mirrors DELETE /api/inbox/[id]'s per-row behaviour, applied to a
// batch in one transaction so the user doesn't half-delete a list
// if the server dies mid-request. All operations are scoped to the
// requesting user: the deleteMany where-clauses include `userId`,
// so even if the caller sends somebody else's message id the row
// won't match and nothing is deleted.
//
// Response includes the count actually deleted. If the caller sent
// 10 ids but only owns 7, we delete those 7 and return count:7 —
// the client can't tell which 3 were foreign (by design).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

// Cap the batch so the transaction stays bounded. 500 is well
// above anything the UI will realistically send (the list is
// paginated 50/page), but low enough that a bogus payload can't
// DoS the DB. Over the cap we 400 rather than silently truncate —
// the user should see a clear error, not a partial result.
const MAX_IDS = 500;

interface Body {
  ids?: unknown;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    if (!Array.isArray(body.ids)) {
      return bad("ids must be an array of inbox message ids");
    }
    // Normalise + dedupe + drop anything that isn't a non-empty string.
    // Clients occasionally send empty strings when a Set has been
    // built badly; filter them out rather than sending them to Prisma.
    const ids = Array.from(
      new Set(body.ids.filter((v): v is string => typeof v === "string" && v.length > 0))
    );
    if (ids.length === 0) {
      return bad("ids is empty — nothing to delete");
    }
    if (ids.length > MAX_IDS) {
      return bad(`Too many ids (max ${MAX_IDS} per request)`);
    }

    // Single transaction so replies + inbound rows are never left
    // partially deleted. The outboundReply row has a nullable FK to
    // InboundMessage, so without this the UI could show orphan
    // replies briefly while the inbound delete is in flight.
    const [, inbound] = await prisma.$transaction([
      prisma.outboundReply.deleteMany({
        where: {
          userId,
          inboundMessageId: { in: ids },
        },
      }),
      prisma.inboundMessage.deleteMany({
        where: {
          userId,
          id: { in: ids },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, deleted: inbound.count });
  } catch (err) {
    return handleApiError(err, "POST /api/inbox/bulk-delete");
  }
}
