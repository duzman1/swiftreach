// Top performing templates by read rate. Joins MessageTemplate → Campaign
// (mode:"template" + matching templateName) → Contact for the sent/read
// breakdown. The template names live on Campaign rows because Meta
// templates are referenced by name, not a foreign key.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { pct, campaignClientFilter } from "@/lib/analytics";

export const dynamic = "force-dynamic";

interface Row {
  templateId: string | null;
  templateName: string;
  timesUsed: number;
  sent: number;
  read: number;
  readRate: number;
  lastUsedAt: Date | null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const gate = await requireFeature(userId, "fullAnalytics");
    if (gate) return gate;

    const url = new URL(req.url);
    const clientFilter = campaignClientFilter(url.searchParams);

    // Pull both freeform-message-as-template (saved via "Save as template")
    // and Meta templates. Group counts by templateName for now — the
    // user-facing identity.
    const templates = await prisma.messageTemplate.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        usageCount: true,
        lastUsedAt: true,
      },
    });

    // Read engagement comes from Campaigns where mode is "template" and
    // templateName matches. For freeform-saved templates, we don't have a
    // direct link — usageCount is the only signal.
    const campaigns = await prisma.campaign.findMany({
      where: { userId, mode: "template", ...clientFilter },
      select: {
        templateName: true,
        contacts: {
          select: { status: true },
        },
      },
    });

    const aggBy = new Map<string, { sent: number; read: number }>();
    for (const c of campaigns) {
      const key = c.templateName ?? "";
      if (!key) continue;
      const agg = aggBy.get(key) ?? { sent: 0, read: 0 };
      for (const ct of c.contacts) {
        if (ct.status === "sent" || ct.status === "delivered" || ct.status === "read") {
          agg.sent++;
          if (ct.status === "read") agg.read++;
        }
      }
      aggBy.set(key, agg);
    }

    const rows: Row[] = templates.map((t) => {
      const agg = aggBy.get(t.name) ?? { sent: 0, read: 0 };
      return {
        templateId: t.id,
        templateName: t.name,
        timesUsed: t.usageCount,
        sent: agg.sent,
        read: agg.read,
        readRate: pct(agg.read, agg.sent),
        lastUsedAt: t.lastUsedAt,
      };
    });

    // Also surface Meta-template names that don't have a matching saved
    // template (e.g. raw API templates not saved locally) — useful signal.
    for (const [name, agg] of aggBy) {
      if (templates.find((t) => t.name === name)) continue;
      rows.push({
        templateId: null,
        templateName: name,
        timesUsed: 0,
        sent: agg.sent,
        read: agg.read,
        readRate: pct(agg.read, agg.sent),
        lastUsedAt: null,
      });
    }

    rows.sort((a, b) => b.readRate - a.readRate || b.sent - a.sent);

    return NextResponse.json({ ok: true, templates: rows });
  } catch (err) {
    return handleApiError(err, "GET /api/analytics/templates");
  }
}
