// API-key management — list + create. Authenticated via Clerk.
//
// POST returns the PLAIN key once; it's never readable again. The
// Settings UI shows it inside a copy-once modal and discards from
// state on close.

import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/apiKeys";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const MAX_KEYS_PER_PLAN: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 3,
  pro: 10,
};

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        keySuffix: true,
        lastUsedAt: true,
        requestCount: true,
        createdAt: true,
      },
    });
    const planMax = MAX_KEYS_PER_PLAN[user.plan] ?? 0;
    return successResponse({
      keys,
      plan: user.plan,
      maxKeys: planMax,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/api-keys");
  }
}

interface CreateBody {
  name?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const name = body.name?.trim() ?? "";
    if (name.length < 2) {
      return errorResponse("Key name is required (min 2 characters)", 400);
    }
    if (name.length > 60) {
      return errorResponse("Key name must be 60 characters or fewer", 400);
    }

    const max = MAX_KEYS_PER_PLAN[user.plan] ?? 0;
    if (max === 0) {
      return errorResponse(
        "API access requires a paid plan. Upgrade at swiftreach.app/billing",
        403
      );
    }

    const existing = await prisma.apiKey.count({
      where: { userId: user.id, isActive: true },
    });
    if (existing >= max) {
      return errorResponse(
        `Your ${user.plan} plan allows up to ${max} API key${
          max === 1 ? "" : "s"
        }. Revoke an existing key or upgrade your plan.`,
        403
      );
    }

    const { plainKey, keyHash, keyPrefix, keySuffix } = generateApiKey();
    const created = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name,
        keyHash,
        keyPrefix,
        keySuffix,
      },
      select: { id: true, name: true, keyPrefix: true, keySuffix: true },
    });

    // Plain key is returned exactly once. Never persisted.
    return successResponse({
      key: plainKey,
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      keySuffix: created.keySuffix,
      message: "Copy this key now. It will not be shown again.",
    });
  } catch (err) {
    return handleApiError(err, "POST /api/api-keys");
  }
}
