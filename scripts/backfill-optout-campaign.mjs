// One-time backfill: attribute existing OptOutLog rows to a
// campaign via the same rule the live detector uses (most recent
// Contact.sentAt for this userId+phone at or before the opt-out,
// within OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS = 30 days).
//
// Idempotent — safe to re-run. Only writes rows where campaignId
// is currently null, so a second pass touches nothing.
//
// Usage:
//   node scripts/backfill-optout-campaign.mjs           # DRY RUN
//   node scripts/backfill-optout-campaign.mjs --apply   # writes
//
// Dry run against Neon (2026-09-08) returned zero OptOutLog rows;
// the write mode is a no-op today. Kept in the repo so it can be
// re-run when opt-out data exists — the attribution rule stays in
// lockstep with lib/optOutAttribution.ts.pickAttributedCampaign.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(scriptDir, "..", ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let val = m[2];
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

// Must match lib/optOutAttribution.ts. Re-declared here rather
// than imported because this script runs under plain Node (no
// TS loader) and the constant is short. If policy changes,
// update BOTH places.
const OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS = 30;
const APPLY = process.argv.includes("--apply");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const rows = await prisma.optOutLog.findMany({
    where: { campaignId: null },
    select: { id: true, userId: true, phoneNumber: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Unattributed OptOutLog rows: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  let attributed = 0;
  let unattributable = 0;
  let updated = 0;

  for (const r of rows) {
    const cutoff = new Date(
      r.createdAt.getTime() - OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    );
    const match = await prisma.contact.findFirst({
      where: {
        phoneNumber: r.phoneNumber,
        sentAt: { gte: cutoff, lte: r.createdAt },
        campaign: { userId: r.userId },
      },
      orderBy: { sentAt: "desc" },
      select: { campaignId: true },
    });
    if (!match) {
      unattributable++;
      continue;
    }
    attributed++;
    if (APPLY) {
      await prisma.optOutLog.update({
        where: { id: r.id },
        data: { campaignId: match.campaignId },
      });
      updated++;
    }
  }

  console.log(`\nAttribution summary:`);
  console.log(`  attributed        : ${attributed}`);
  console.log(`  unattributable    : ${unattributable}`);
  if (APPLY) {
    console.log(`  rows updated      : ${updated}`);
  } else {
    console.log(`\n(Dry run — no writes. Re-run with --apply to persist.)`);
  }
} finally {
  await prisma.$disconnect();
}
