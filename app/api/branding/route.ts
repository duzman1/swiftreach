// White-label branding — GET the current shape, PUT updates.
//
// Every plan can READ (the Branding settings page shows a locked
// preview for below-Pro users). Only Pro can WRITE — enforced by
// requireFeature("whiteLabelReports"). Access is decided by the
// `plan` field alone; see lib/plans.ts's CRITICAL BEHAVIOUR block.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { resolveBranding, isValidHex } from "@/lib/branding";

export const dynamic = "force-dynamic";

const MAX_COMPANY_NAME = 120;
const MAX_FOOTER = 200;

interface UpdateBody {
  companyName?: string | null;
  accentColor?: string | null;
  footerText?: string | null;
  hideSwiftReachBranding?: boolean;
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      ok: true,
      plan: user.plan,
      canEdit: user.plan === "pro",
      branding: resolveBranding(user),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/branding");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();

    // Pro-only write gate — returns { ok:false, upgradeRequired,
    // requiredPlan: "pro" } per the standard 403 shape.
    const gate = await requireFeature(user.id, "whiteLabelReports");
    if (gate) return gate;

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const patch: Record<string, unknown> = {};

    if ("companyName" in body) {
      const v = body.companyName?.trim() ?? "";
      if (v.length > MAX_COMPANY_NAME) {
        return errorResponse(
          `Company name must be ${MAX_COMPANY_NAME} characters or fewer`,
          400
        );
      }
      patch.companyName = v === "" ? null : v;
    }

    if ("accentColor" in body) {
      const v = (body.accentColor ?? "").trim();
      if (v && !isValidHex(v)) {
        return errorResponse(
          "Accent color must be a 6-digit hex value like #25D366",
          400
        );
      }
      // Empty string clears back to the default via the resolver's
      // fallback branch. Store the default explicitly so downstream
      // reads don't need to know it.
      patch.accentColor = v || "#25D366";
    }

    if ("footerText" in body) {
      const v = body.footerText?.trim() ?? "";
      if (v.length > MAX_FOOTER) {
        return errorResponse(
          `Footer text must be ${MAX_FOOTER} characters or fewer`,
          400
        );
      }
      patch.footerText = v === "" ? null : v;
    }

    if ("hideSwiftReachBranding" in body) {
      patch.hideSwiftReachBranding = Boolean(body.hideSwiftReachBranding);
    }

    if (Object.keys(patch).length === 0) {
      return errorResponse("No fields to update", 400);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: patch,
    });

    return NextResponse.json({
      ok: true,
      branding: resolveBranding(updated),
    });
  } catch (err) {
    return handleApiError(err, "PUT /api/branding");
  }
}
