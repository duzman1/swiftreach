// POST /api/reports/generate — Pro-only white-label PDF report.
//
// Two shapes:
//   { campaignId: "cid" }               → single-campaign report
//   { range: { start, end }, clientId? } → date-range report
//
// clientId is accepted but ignored today — forward-compat filter for
// per-client scoping. See lib/report/reportData.ts.
//
// Response is a `application/pdf` stream with Content-Disposition
// attachment. Generation happens fully server-side (never in the
// browser). Rate-limited to 20 generations per account per hour so
// a loop cannot exhaust the function budget.

import { NextRequest, NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { resolveBrandingOrNull, companySlug } from "@/lib/branding";
import {
  loadCampaignReport,
  loadRangeReport,
  type ReportData,
} from "@/lib/report/reportData";
import { CampaignReport } from "@/lib/report/CampaignReport";

export const dynamic = "force-dynamic";
// PDF render + Prisma round-trips fit inside the 60s Vercel default.
// Bump the maxDuration explicitly so a large range doesn't timeout.
export const maxDuration = 60;

const RATE_LIMIT_PER_HOUR = 20;
const MAX_RANGE_DAYS = 366; // ≤ 12 months, allowing a leap year

interface BodyShape {
  campaignId?: string;
  range?: { start?: string; end?: string };
  clientId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const gate = await requireFeature(user.id, "whiteLabelReports");
    if (gate) return gate;

    // Rate limit — 20 per rolling hour. Cheap indexed count.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.reportGeneration.count({
      where: { userId: user.id, createdAt: { gte: hourAgo } },
    });
    if (recent >= RATE_LIMIT_PER_HOUR) {
      return errorResponse(
        `Rate limit reached — ${RATE_LIMIT_PER_HOUR} reports per hour. Try again in a few minutes.`,
        429
      );
    }

    let body: BodyShape;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const wantsCampaign = typeof body.campaignId === "string" && body.campaignId.length > 0;
    const wantsRange = !!body.range;

    if (wantsCampaign === wantsRange) {
      return errorResponse(
        "Provide exactly one of `campaignId` or `range`.",
        400
      );
    }

    // Refuse to generate if the user has no real company name AND no
    // firstName+lastName on their account. Client-facing PDFs must
    // never ship with a placeholder — the alternative was defaulting
    // to the email local-part, which would title a report "onozied".
    const branding = resolveBrandingOrNull(user);
    if (!branding) {
      return errorResponse(
        "Set a company name in Settings → Branding before generating a report.",
        400,
        { missing: "companyName" }
      );
    }
    // Timezone: fall back to defaults from the User record, then UTC.
    // We don't currently store a per-user timezone (defaultCountryCode
    // is the closest thing) — using UTC keeps generated times honest
    // rather than pretending to know the user's local wall clock.
    const timezone = "UTC";
    const generatedAt = new Date();

    let data: ReportData;
    let title: string;
    let subtitle: string;
    let kind: "campaign" | "range";
    let filenameStub: string;

    if (wantsCampaign) {
      const loaded = await loadCampaignReport(user.id, body.campaignId!);
      if (!loaded) {
        return errorResponse("Campaign not found", 404);
      }
      data = loaded;
      title = "Campaign Report";
      subtitle = `${loaded.campaign!.name} · Sent ${new Intl.DateTimeFormat("en-US", {
        year: "numeric", month: "long", day: "numeric", timeZone: timezone,
      }).format(loaded.campaign!.createdAt)}`;
      kind = "campaign";
      filenameStub = companySlug(loaded.campaign!.name);
    } else {
      const startRaw = body.range?.start;
      const endRaw = body.range?.end;
      const start = startRaw ? new Date(startRaw) : null;
      const end = endRaw ? new Date(endRaw) : null;
      if (
        !start || !end ||
        Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ) {
        return errorResponse("range.start and range.end must be ISO dates", 400);
      }
      if (start > end) {
        return errorResponse("range.start must be before range.end", 400);
      }
      const daysApart = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysApart > MAX_RANGE_DAYS) {
        return errorResponse(
          `Date range cannot exceed 12 months (received ${Math.round(daysApart)} days).`,
          400
        );
      }
      data = await loadRangeReport(user.id, { start, end }, body.clientId ?? null);
      title = "Campaign Report";
      const fmt = new Intl.DateTimeFormat("en-US", {
        year: "numeric", month: "long", day: "numeric", timeZone: timezone,
      });
      subtitle = `${fmt.format(start)} – ${fmt.format(end)}`;
      kind = "range";
      filenameStub = "campaigns";
    }

    // Render PDF. @react-pdf's `pdf(<Doc/>).toBuffer()` returns a Node
    // Buffer we can return directly as the response body.
    const doc = (
      <CampaignReport
        data={data}
        branding={branding}
        timezone={timezone}
        generatedAt={generatedAt}
        title={title}
        subtitle={subtitle}
      />
    );

    // pdf().toBuffer() returns a Node.js ReadableStream (not a Buffer,
    // despite the name — the API is legacy). Collect chunks into a
    // Buffer so NextResponse can set an explicit Content-Length and
    // the browser knows how much to expect.
    const stream = await pdf(doc).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Record for rate limiting AFTER a successful render — failed
    // renders don't count against the user.
    await prisma.reportGeneration.create({
      data: { userId: user.id, kind },
    });

    // Filename: <company-slug>-<stub>-<yyyy-mm-dd>.pdf. Company
    // slug leads so a client sees THEIR agency's name in the file
    // list, not "campaigns-2026-09-05.pdf".
    const y = generatedAt.getUTCFullYear();
    const m = String(generatedAt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(generatedAt.getUTCDate()).padStart(2, "0");
    const filename = `${companySlug(branding.companyName)}-${filenameStub}-${y}-${m}-${d}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/reports/generate");
  }
}
