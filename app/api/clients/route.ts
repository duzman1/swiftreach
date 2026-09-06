// Client label CRUD — Pro only, gated on perClientReporting.
//
// GET returns every client (archived + active) plus a contactCount
// and campaignCount so the UI can show what a delete would unlabel.
// POST creates a new client; enforces the 50-per-account sanity cap
// and the (userId, name) unique constraint (rejected as 409 on
// duplicate rather than a raw Prisma error).

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";

export const dynamic = "force-dynamic";

const MAX_CLIENTS_PER_ACCOUNT = 50;
const MAX_NAME = 80;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface CreateBody {
  name?: string;
  color?: string | null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "perClientReporting");
    if (gate) return gate;

    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { savedContacts: true, campaigns: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        archived: c.archived,
        createdAt: c.createdAt,
        contactCount: c._count.savedContacts,
        campaignCount: c._count.campaigns,
      })),
      limit: MAX_CLIENTS_PER_ACCOUNT,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/clients");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "perClientReporting");
    if (gate) return gate;

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
    const name = body.name?.trim() ?? "";
    if (!name) return errorResponse("Client name is required", 400);
    if (name.length > MAX_NAME) {
      return errorResponse(`Client name must be ${MAX_NAME} characters or fewer`, 400);
    }

    const color = body.color?.trim() ?? "";
    if (color && !HEX_RE.test(color)) {
      return errorResponse("Color must be a 6-digit hex like #25D366", 400);
    }

    // Sanity cap — 50 labels is well beyond any real agency, and
    // guards against the UI accidentally spamming create requests.
    const count = await prisma.client.count({ where: { userId: user.id } });
    if (count >= MAX_CLIENTS_PER_ACCOUNT) {
      return errorResponse(
        `You've hit the ${MAX_CLIENTS_PER_ACCOUNT}-client limit. Archive one to make room, or contact support if you truly need more.`,
        409
      );
    }

    try {
      const created = await prisma.client.create({
        data: {
          userId: user.id,
          name,
          color: color || null,
        },
      });
      return NextResponse.json({
        ok: true,
        client: {
          id: created.id,
          name: created.name,
          color: created.color,
          archived: created.archived,
          createdAt: created.createdAt,
          contactCount: 0,
          campaignCount: 0,
        },
      });
    } catch (err) {
      // (userId, name) unique — friendlier 409 than a raw Prisma error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("A client with that name already exists.", 409);
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err, "POST /api/clients");
  }
}
