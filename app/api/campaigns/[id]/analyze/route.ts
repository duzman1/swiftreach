// Manual trigger for the post-campaign alert engine.
//
// The send loop calls runCampaignAlerts() directly at completion, so
// this route is mostly a fallback for:
//   - re-running analysis on old campaigns that predate the alert
//     engine (though the idempotency guard will skip them if already
//     run)
//   - future UI features (e.g. "re-analyse" button)
//
// Both regular user sessions (Clerk) and internal service calls
// (CRON_SECRET header) are accepted. Internal calls skip user-owned-
// campaign checks since they might be triggered by system tasks.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { runCampaignAlerts } from "@/lib/campaignAlerts";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;

    // Internal service call bypass — used if any future job wants
    // to trigger analysis without a user session.
    const serviceToken = request.headers.get("X-Service-Token");
    const isInternal =
      !!process.env.CRON_SECRET &&
      serviceToken === process.env.CRON_SECRET;

    if (!isInternal) {
      // Regular user auth — must own the campaign.
      const userId = await requireUserId();
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { userId: true },
      });
      if (!campaign) {
        return NextResponse.json(
          { ok: false, error: "Campaign not found" },
          { status: 404 }
        );
      }
      if (campaign.userId !== userId) {
        return NextResponse.json(
          { ok: false, error: "Forbidden" },
          { status: 403 }
        );
      }
    }

    const result = await runCampaignAlerts(campaignId);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Analysis failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyRun: result.alreadyRun ?? false,
      alertCount: result.alertCount ?? 0,
      hasCritical: result.hasCritical ?? false,
      stats: result.stats,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/campaigns/[id]/analyze");
  }
}
