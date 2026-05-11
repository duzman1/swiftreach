// Opt-out plumbing — keyword detection, suppression check, and the
// "process opt-out" side-effect (mark SavedContact, write OptOutLog,
// scrub pending scheduled campaigns).
//
// SECURITY/COMPLIANCE: WhatsApp policy treats sending to an opted-out
// contact as a serious violation. This helper is the single source of
// truth — every send path MUST consult it.

import { prisma } from "./prisma";

// Keywords are matched case-insensitive against the trimmed message body.
// We accept the exact form OR with surrounding punctuation/whitespace.
const OPT_OUT_KEYWORDS = [
  "stop",
  "unsubscribe",
  "cancel",
  "quit",
  "end",
  "optout",
  "opt out",
  "opt-out",
  "remove me",
  "unsubscribe me",
];

/** Returns the matched keyword if `text` is an opt-out, else null. */
export function detectOptOutKeyword(text: string): string | null {
  if (!text) return null;
  const cleaned = text.trim().toLowerCase().replace(/[!.,?;:]+$/g, "");
  for (const k of OPT_OUT_KEYWORDS) {
    if (cleaned === k) return k;
  }
  return null;
}

/**
 * Mark a contact as opted out, log the event, and scrub them from any
 * pending scheduled campaigns belonging to the same user.
 *
 * Idempotent — safe to call repeatedly for the same phone.
 */
export async function processOptOut(
  userId: string,
  phoneNumber: string,
  keyword: string,
  source: "whatsapp" | "manual" = "whatsapp"
): Promise<void> {
  // Upsert SavedContact: if they don't exist yet, create one with optedOut=true
  // so future sends suppress them even if the user never imported them.
  await prisma.savedContact.upsert({
    where: { userId_phoneNumber: { userId, phoneNumber } },
    create: {
      userId,
      phoneNumber,
      optedOut: true,
      optedOutAt: new Date(),
    },
    update: {
      optedOut: true,
      optedOutAt: new Date(),
    },
  });

  await prisma.optOutLog.create({
    data: {
      userId,
      phoneNumber,
      keyword,
      source,
    },
  });

  // Scrub from pending scheduled campaigns. contactListData is JSON; we
  // walk every still-scheduled campaign for this user and rewrite the
  // list. This is O(scheduledCampaigns) — typically tiny.
  const sched = await prisma.scheduledCampaign.findMany({
    where: { userId, status: "scheduled" },
    select: { id: true, contactListData: true, phoneColumn: true },
  });
  for (const s of sched) {
    let rows: Array<Record<string, string>>;
    try {
      rows = JSON.parse(s.contactListData || "[]");
    } catch {
      continue;
    }
    const filtered = rows.filter((r) => {
      const raw = r[s.phoneColumn] ?? "";
      // Cheap match — strip non-digits and compare; if the contact's
      // normalised phone equals the opted-out number, drop the row.
      const digits = String(raw).replace(/\D/g, "");
      return digits !== phoneNumber && digits !== phoneNumber.replace(/^\+?/, "");
    });
    if (filtered.length !== rows.length) {
      await prisma.scheduledCampaign.update({
        where: { id: s.id },
        data: { contactListData: JSON.stringify(filtered) },
      });
    }
  }
}

/**
 * Returns true if a phone is opted out for this user. Caller is expected to
 * have normalised the phone via lib/phoneUtils first.
 */
export async function isOptedOut(
  userId: string,
  phoneNumber: string
): Promise<boolean> {
  const c = await prisma.savedContact.findUnique({
    where: { userId_phoneNumber: { userId, phoneNumber } },
    select: { optedOut: true },
  });
  return Boolean(c?.optedOut);
}
