// Compliance dashboard data. Every count on the page is a live query
// — no placeholders (per spec). Availability: every plan, including
// Free, so no feature gate. Compliance is protection, not an upsell.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

// The suppression-log window defaults to the last 30 days. Callers
// can pass ?days=N to widen or narrow it (max 365). Kept bounded so
// a heavy user doesn't accidentally scan a year of data every open.
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get("days") ?? DEFAULT_WINDOW_DAYS);
    const days = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.max(1, Math.floor(requested)), MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Parallelised — every count is independent.
    const [
      totalContacts,
      unknownConsent,
      importedConsent,
      explicitConsent,
      dncTotal,
      totalOptedOutContacts,
      suppressionsWindow,
      suppressionByReason,
      suppressionBySurface,
    ] = await Promise.all([
      prisma.savedContact.count({ where: { userId } }),
      prisma.savedContact.count({ where: { userId, consentStatus: "unknown" } }),
      prisma.savedContact.count({ where: { userId, consentStatus: "imported" } }),
      prisma.savedContact.count({ where: { userId, consentStatus: "explicit" } }),
      prisma.doNotContact.count({ where: { userId } }),
      prisma.savedContact.count({ where: { userId, optedOut: true } }),
      prisma.suppressionLog.count({
        where: { userId, createdAt: { gte: since } },
      }),
      prisma.suppressionLog.groupBy({
        by: ["reason"],
        where: { userId, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.suppressionLog.groupBy({
        by: ["surface"],
        where: { userId, createdAt: { gte: since } },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      windowDays: days,
      consent: {
        total: totalContacts,
        explicit: explicitConsent,
        imported: importedConsent,
        unknown: unknownConsent,
      },
      doNotContact: {
        listSize: dncTotal,
        contactsFlaggedOptedOut: totalOptedOutContacts,
      },
      suppressionsWindow: {
        total: suppressionsWindow,
        byReason: Object.fromEntries(
          suppressionByReason.map((r) => [r.reason, r._count])
        ),
        bySurface: Object.fromEntries(
          suppressionBySurface.map((s) => [s.surface, s._count])
        ),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/compliance/summary");
  }
}
