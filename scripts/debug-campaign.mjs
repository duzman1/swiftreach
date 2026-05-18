// Debug helper: dumps the most recent campaign + a few of its contacts so
// we can see what state the send loop is reading. Run with:
//
//   node scripts/debug-campaign.mjs
//
// Optional: pass a specific campaign id as the first arg —
//   node scripts/debug-campaign.mjs cm0abc123...

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debug() {
  const targetId = process.argv[2];

  const campaign = targetId
    ? await prisma.campaign.findUnique({
        where: { id: targetId },
        include: {
          contacts: {
            take: 5,
            orderBy: { id: "asc" },
            select: {
              id: true,
              status: true,
              phoneNumber: true,
              personalizedMessage: true,
              rowData: true,
              errorMessage: true,
            },
          },
        },
      })
    : await prisma.campaign.findFirst({
        orderBy: { createdAt: "desc" },
        include: {
          contacts: {
            take: 5,
            orderBy: { id: "asc" },
            select: {
              id: true,
              status: true,
              phoneNumber: true,
              personalizedMessage: true,
              rowData: true,
              errorMessage: true,
            },
          },
        },
      });

  if (!campaign) {
    console.log("No campaign found.");
    await prisma.$disconnect();
    return;
  }

  // Status-distribution count: shows how many contacts are in each
  // status. If everything is "skipped" we expect to see that here.
  const statusCounts = await prisma.contact.groupBy({
    by: ["status"],
    where: { campaignId: campaign.id },
    _count: { status: true },
  });

  // If the user is on a paid plan we ALSO read their opt-out set, since
  // that's the most common reason for "all skipped" — every imported
  // phone happens to match an existing SavedContact with optedOut:true.
  const optOutCount = campaign.userId
    ? await prisma.savedContact.count({
        where: { userId: campaign.userId, optedOut: true },
      })
    : 0;

  // ── Output ────────────────────────────────────────────────────────────
  console.log("\n=== Campaign ===");
  console.log({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    mode: campaign.mode,
    templateName: campaign.templateName,
    // Note: schema field is `variableMap` (not `columnMap`).
    variableMap: campaign.variableMap,
    staticVars: campaign.staticVars,
    phoneColumn: campaign.phoneColumn,
    delayMs: campaign.delayMs,
    totalCount: campaign.totalCount,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    skippedCount: campaign.skippedCount,
    userId: campaign.userId,
    createdAt: campaign.createdAt,
    completedAt: campaign.completedAt,
  });

  console.log("\n=== Status distribution ===");
  console.log(statusCounts);

  console.log("\n=== Opt-out set size for owner ===");
  console.log({ optedOutPhones: optOutCount });

  console.log("\n=== Sample contacts (up to 5) ===");
  for (const c of campaign.contacts) {
    let rowDataKeys = [];
    try {
      rowDataKeys = Object.keys(JSON.parse(c.rowData || "{}"));
    } catch {
      rowDataKeys = ["<unparseable rowData>"];
    }
    console.log({
      id: c.id,
      phone: c.phoneNumber,
      status: c.status,
      hasMessage: !!c.personalizedMessage,
      messageLength: c.personalizedMessage?.length ?? 0,
      messagePreview: (c.personalizedMessage ?? "").slice(0, 80),
      errorMessage: c.errorMessage,
      rowDataKeys,
    });
  }

  // Cross-check: are any of the sample phones in the opt-out set?
  if (campaign.userId && campaign.contacts.length > 0) {
    const samplePhones = campaign.contacts.map((c) => c.phoneNumber);
    const optedOutHits = await prisma.savedContact.findMany({
      where: {
        userId: campaign.userId,
        optedOut: true,
        phoneNumber: { in: samplePhones },
      },
      select: { phoneNumber: true, optedOutAt: true },
    });
    console.log("\n=== Opt-out matches on sampled contacts ===");
    console.log(optedOutHits.length === 0 ? "(none)" : optedOutHits);
  }

  await prisma.$disconnect();
}

debug().catch(async (err) => {
  console.error("debug-campaign failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
