// Unread campaign alerts for the dashboard banner.
//
// GET  — returns unread warning/critical alerts for the current user
//        (up to 5), plus a total count. Success/info alerts are
//        rendered on the campaign detail page but NOT in the banner —
//        the banner is reserved for things that need attention.
//
// PUT  — mark specific alerts as read. Body: { alertIds: string[] }.
//        Called from the dashboard banner's dismiss action and from
//        the campaign detail page when the user views alerts inline.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const BANNER_TYPES = ["warning", "critical"] as const;

export async function GET() {
  try {
    const userId = await requireUserId();

    const [alerts, totalUnread] = await Promise.all([
      prisma.campaignAlert.findMany({
        where: {
          userId,
          isRead: false,
          type: { in: [...BANNER_TYPES] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          campaign: { select: { id: true, name: true } },
        },
      }),
      prisma.campaignAlert.count({
        where: {
          userId,
          isRead: false,
          type: { in: [...BANNER_TYPES] },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, alerts, totalUnread });
  } catch (err) {
    return handleApiError(err, "GET /api/alerts");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = (await request.json().catch(() => ({}))) as {
      alertIds?: unknown;
    };

    if (!Array.isArray(body.alertIds) || body.alertIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "alertIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const ids = body.alertIds.filter(
      (id): id is string => typeof id === "string"
    );

    const result = await prisma.campaignAlert.updateMany({
      where: {
        id: { in: ids },
        userId, // ownership check baked into the where clause
      },
      data: { isRead: true },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (err) {
    return handleApiError(err, "PUT /api/alerts");
  }
}
