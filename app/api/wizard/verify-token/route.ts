// Generate a webhookVerifyToken for the user if they don't already have
// one. Idempotent — if a token already exists we return it without
// touching the DB. The wizard's Step 6 calls this on mount so the
// "copy this to Meta" panel always has a value ready.
//
// We mint with crypto.randomBytes(20) → 40 hex chars. Meta only sees
// the value when the user pastes it into their webhook config, so the
// strength only matters for the verification handshake; 160 bits is
// more than enough.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();

    if (user.webhookVerifyToken && user.webhookVerifyToken.length >= 16) {
      return NextResponse.json({
        ok: true,
        webhookVerifyToken: user.webhookVerifyToken,
        generated: false,
      });
    }

    const token = crypto.randomBytes(20).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { webhookVerifyToken: token },
    });

    return NextResponse.json({
      ok: true,
      webhookVerifyToken: token,
      generated: true,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/wizard/verify-token");
  }
}
