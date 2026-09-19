// Admin users list — paginated + filterable + searchable. Returns counts so
// the UI can show "Showing 1–25 of 412". Never includes the encrypted token
// blob in the response.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const search = url.searchParams.get("q")?.trim() ?? "";
    const plan = url.searchParams.get("plan") ?? "";
    const status = url.searchParams.get("status") ?? ""; // active|past_due|canceled|suspended
    const sort = url.searchParams.get("sort") ?? "newest"; // newest|oldest|usage|messages
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }
    // Validated through lib/plans.ts: getPlan() returns the "free"
    // fallback for anything it doesn't recognise, so `id === plan`
    // is true only when `plan` is a real tier. Earlier hand-rolled
    // ["free","starter","growth"] list forgot Pro — a ?plan=pro
    // query silently fell through, returning ALL users instead of
    // just Pro (worse than an error). This form self-updates when
    // a new tier is added to PLANS.
    if (plan && getPlan(plan).id === plan) {
      where.plan = plan;
    }
    if (status === "suspended") {
      where.suspended = true;
    } else if (status && ["active", "past_due", "canceled", "trialing"].includes(status)) {
      where.stripeSubscriptionStatus = status;
    }

    const orderBy: Prisma.UserOrderByWithRelationInput =
      sort === "oldest"
        ? { createdAt: "asc" }
        : sort === "usage"
        ? { messagesUsedThisMonth: "desc" }
        : { createdAt: "desc" };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          plan: true,
          stripeSubscriptionStatus: true,
          suspended: true,
          messagesUsedThisMonth: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      users,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users");
  }
}
