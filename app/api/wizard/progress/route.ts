// Phase 7 wizard progress. GET returns the user's saved step + completion
// timestamps; PUT advances the step (forward-only — DB never regresses
// even if the UI lets the user click Back).
//
// On the FIRST PUT, stamps wizardStartedAt so the funnel can be measured.
// On step >= 7, stamps wizardCompletedAt AND onboardingCompletedAt so the
// pre-Phase-7 dashboard redirect (`if !user.onboardingCompletedAt`) keeps
// working.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const TOTAL_STEPS = 7;

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      ok: true,
      step: user.wizardStep,
      totalSteps: TOTAL_STEPS,
      startedAt: user.wizardStartedAt?.toISOString() ?? null,
      completedAt: user.wizardCompletedAt?.toISOString() ?? null,
      // Surfaced so the UI can pre-fill / decide whether each step's
      // continue button is gated on something being saved.
      hasPhoneNumberId: Boolean(user.whatsappPhoneNumberId),
      hasBusinessAccountId: Boolean(user.whatsappBusinessAccountId),
      hasApiToken: Boolean(user.whatsappApiToken),
      hasWebhookVerifyToken: Boolean(user.webhookVerifyToken),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/wizard/progress");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();

    let body: { step?: number };
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const target = Number(body.step);
    if (!Number.isInteger(target) || target < 1 || target > TOTAL_STEPS) {
      return bad(`step must be an integer 1..${TOTAL_STEPS}`);
    }

    const data: Record<string, unknown> = {};

    // Forward-only: only advance if higher than current DB value. Clicking
    // Back in the UI is purely visual — the DB still remembers the
    // furthest point so the wizard resumes there next session.
    if (target > user.wizardStep) {
      data.wizardStep = target;
    }
    if (!user.wizardStartedAt) {
      data.wizardStartedAt = new Date();
    }
    if (target >= TOTAL_STEPS && !user.wizardCompletedAt) {
      const now = new Date();
      data.wizardCompletedAt = now;
      // Also stamp the legacy field so pre-Phase-7 redirect logic on the
      // dashboard treats the user as onboarded.
      data.onboardingCompletedAt = now;
    }

    if (Object.keys(data).length === 0) {
      // No-op update — return current state.
      return NextResponse.json({
        ok: true,
        step: user.wizardStep,
        totalSteps: TOTAL_STEPS,
        completedAt: user.wizardCompletedAt?.toISOString() ?? null,
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return NextResponse.json({
      ok: true,
      step: updated.wizardStep,
      totalSteps: TOTAL_STEPS,
      completedAt: updated.wizardCompletedAt?.toISOString() ?? null,
    });
  } catch (err) {
    return handleApiError(err, "PUT /api/wizard/progress");
  }
}
