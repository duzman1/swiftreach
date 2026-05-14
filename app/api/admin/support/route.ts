// Admin support list. Filterable by status / priority + free-text
// search across subject + reference. Joined with the owning user
// for email + name so the admin can triage at a glance.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const priority = url.searchParams.get("priority") ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") ?? "1", 10) || 1
    );

    const where: Prisma.SupportRequestWhereInput = {};
    if (status && ["open", "in_progress", "resolved", "closed"].includes(status))
      where.status = status;
    if (priority && ["low", "normal", "high", "urgent"].includes(priority))
      where.priority = priority;
    if (q) {
      where.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    // Status counts ignore the active filter so the header chips show
    // the platform-wide truth, not the filtered subset.
    const [total, requests, openCount, inProgressCount, resolvedCount, closedCount] =
      await Promise.all([
        prisma.supportRequest.count({ where }),
        prisma.supportRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            reference: true,
            category: true,
            subject: true,
            priority: true,
            status: true,
            createdAt: true,
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        }),
        prisma.supportRequest.count({ where: { status: "open" } }),
        prisma.supportRequest.count({ where: { status: "in_progress" } }),
        prisma.supportRequest.count({ where: { status: "resolved" } }),
        prisma.supportRequest.count({ where: { status: "closed" } }),
      ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      requests,
      counts: {
        open: openCount,
        in_progress: inProgressCount,
        resolved: resolvedCount,
        closed: closedCount,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support");
  }
}
