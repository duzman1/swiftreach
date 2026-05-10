// User-facing read of the currently-active announcement, if any. Authenticated
// route — non-signed-in users don't see banners. We filter by audience based
// on the requesting user's plan so a free-only announcement doesn't leak to
// paid users (and vice versa).
//
// Returns { announcement: null } when there's nothing to show — the caller
// (AnnouncementBanner) just renders nothing in that case.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: true, announcement: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const isPaid = user && user.plan !== "free";

    // Pick the most recent active announcement that targets this user.
    const ann = await prisma.announcement.findFirst({
      where: {
        active: true,
        OR: [
          { target: "all" },
          { target: isPaid ? "paid" : "free" },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        message: true,
        type: true,
        target: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, announcement: ann });
  } catch (err) {
    return handleApiError(err, "GET /api/announcements/active");
  }
}
