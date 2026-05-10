// Admin plan override. Used to grant comp plans, downgrade abusers, etc.
// without going through Stripe checkout.
//
// IMPORTANT: this only updates the local plan field — it does NOT create or
// modify a Stripe subscription. If the user later upgrades via checkout, the
// webhook will reconcile. Use the Customer Portal for real subscription
// changes; this is the manual override.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { PLANS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    let body: { plan?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const plan = String(body.plan ?? "").toLowerCase();
    if (!plan || !(plan in PLANS)) {
      return NextResponse.json(
        { ok: false, error: `Plan must be one of: ${Object.keys(PLANS).join(", ")}` },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { plan },
      select: { id: true, plan: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/plan");
  }
}
