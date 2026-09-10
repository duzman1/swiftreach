// Compliance dashboard: Meta template + phone-number status. Pulls
// live from the Cloud API on every request — no DB cache table. The
// dashboard doesn't reload aggressively; a per-serverless-instance
// TTL cache keeps a fat-finger reload from hammering Meta.
//
// Available on every plan (compliance is protection, not an
// upsell). Requires the user to have connected WhatsApp; otherwise
// returns { ok: true, connected: false } so the tile can render
// "Connect WhatsApp to see status" rather than an error.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import {
  loadMetaCreds,
  fetchTemplateStatuses,
  fetchPhoneStatuses,
  isTemplateSendable,
  type MetaTemplateStatus,
  type MetaPhoneStatus,
} from "@/lib/metaStatus";

export const dynamic = "force-dynamic";

// Per-user, per-serverless-instance TTL. 90s is a compromise:
// short enough that a user who fixes a rejected template sees the
// update within a couple minutes of hitting refresh; long enough to
// stop the dashboard from re-hammering Meta every click.
const CACHE_TTL_MS = 90_000;

interface CachedEntry {
  templates: MetaTemplateStatus[] | null;
  phones: MetaPhoneStatus[] | null;
  templatesError: string | null;
  phonesError: string | null;
  fetchedAt: number;
}

const cache = new Map<string, CachedEntry>();

export async function GET() {
  try {
    const userId = await requireUserId();

    const creds = await loadMetaCreds(userId);
    if (!creds) {
      return NextResponse.json({
        ok: true,
        connected: false,
        message: "Connect WhatsApp to see template and quality status.",
      });
    }

    const cached = cache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(shape(cached));
    }

    const [templatesResult, phonesResult] = await Promise.all([
      fetchTemplateStatuses(creds),
      fetchPhoneStatuses(creds),
    ]);

    const entry: CachedEntry = {
      templates: Array.isArray(templatesResult) ? templatesResult : null,
      templatesError: Array.isArray(templatesResult) ? null : templatesResult.error,
      phones: Array.isArray(phonesResult) ? phonesResult : null,
      phonesError: Array.isArray(phonesResult) ? null : phonesResult.error,
      fetchedAt: Date.now(),
    };
    cache.set(userId, entry);

    return NextResponse.json(shape(entry));
  } catch (err) {
    return handleApiError(err, "GET /api/compliance/meta-status");
  }
}

function shape(e: CachedEntry) {
  // Roll up template counts + flag any blocking states for the tile.
  // Full list travels too so the UI can drill in if needed.
  let templateCounts: Record<string, number> | null = null;
  let blockingTemplates: Array<{ name: string; status: string; reason: string | null }> = [];
  if (e.templates) {
    templateCounts = {};
    for (const t of e.templates) {
      templateCounts[t.status] = (templateCounts[t.status] ?? 0) + 1;
      const decision = isTemplateSendable(t.status);
      if (decision.severity === "block") {
        blockingTemplates.push({
          name: t.name,
          status: t.status,
          reason: t.rejectedReason,
        });
      }
    }
    // Cap the drill-down list so a user with 90 rejected templates
    // doesn't blow up the dashboard payload.
    blockingTemplates = blockingTemplates.slice(0, 20);
  }
  return {
    ok: true,
    connected: true,
    fetchedAt: new Date(e.fetchedAt).toISOString(),
    templates: {
      total: e.templates?.length ?? 0,
      counts: templateCounts,
      blocking: blockingTemplates,
      error: e.templatesError,
    },
    phones: {
      rows: e.phones ?? [],
      error: e.phonesError,
    },
  };
}
