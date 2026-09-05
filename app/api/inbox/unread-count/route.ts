// Unread inbox count for the sidebar badge. Polled every 30s by the
// Navbar — keep this query as cheap as possible.
//
// Inbox is available to every plan (opt-out replies must reach every
// user, per FIX 2A), so no plan gate here.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const count = await prisma.inboundMessage.count({
      where: { userId, read: false },
    });
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return handleApiError(err, "GET /api/inbox/unread-count");
  }
}
