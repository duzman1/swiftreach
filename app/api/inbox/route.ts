// Inbox list — every inbound message for the current user, newest first.
// Server-side filter to userId so we never leak across tenants.
//
// Filter params:
//   q       — search messageText / contactName / fromPhone (case-insensitive)
//   read    — "unread" to filter to read=false
//   page    — paginated 50/page

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const readParam = url.searchParams.get("read") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const where: Prisma.InboundMessageWhereInput = { userId };
    if (readParam === "unread") where.read = false;
    if (q) {
      where.OR = [
        { messageText: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { fromPhone: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, messages] = await Promise.all([
      prisma.inboundMessage.count({ where }),
      prisma.inboundMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      messages,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/inbox");
  }
}
