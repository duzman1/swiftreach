// Unread inbox count for the sidebar badge. Polled every 30s by the
// Navbar — keep this query as cheap as possible.
//
// Free-plan users get { count: 0 } silently rather than a 403 — the
// sidebar shouldn't render an "Upgrade" toast every 30s, and a free
// user has no inbox to miss anyway.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { isPaidPlan } from "@/lib/planGate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!isPaidPlan(user?.plan)) {
      return NextResponse.json({ ok: true, count: 0 });
    }
    const count = await prisma.inboundMessage.count({
      where: { userId, read: false },
    });
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return handleApiError(err, "GET /api/inbox/unread-count");
  }
}
