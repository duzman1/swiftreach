// Resend broadcast helper — used by /api/admin/announcements/[id]/broadcast.
// Soft-fails when RESEND_API_KEY isn't set so the rest of the admin panel
// keeps working in environments where email broadcasting isn't configured.
//
// Caller passes the announcement record + the audience filter; we fetch the
// matching users and fan out one email per recipient. Rate limit is loose —
// Resend allows 100 req/sec on the free tier; for SwiftReach's audience
// size that's more than enough.

import { prisma } from "./prisma";
import { logError } from "./errorLog";

interface BroadcastOptions {
  subject: string;
  html: string;
  /** "all" | "free" | "paid" — matches Announcement.target. */
  target: "all" | "free" | "paid";
}

interface BroadcastResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

export async function broadcastEmail(opts: BroadcastOptions): Promise<BroadcastResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "SwiftReach <hello@swiftreach.app>";

  if (!apiKey) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    };
  }

  // Audience selection
  const where =
    opts.target === "free"
      ? { plan: "free" }
      : opts.target === "paid"
      ? { NOT: { plan: "free" } }
      : {};

  const recipients = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
  });

  // Lazy-import so an unconfigured environment doesn't pay the cost of
  // loading the resend SDK.
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      await resend.emails.send({
        from,
        to: r.email,
        subject: opts.subject,
        html: opts.html,
      });
      sent++;
    } catch (err) {
      failed++;
      // One failed send shouldn't crash the broadcast — log it and continue.
      await logError("broadcastEmail", err, { userId: r.id, severity: "warning" });
    }
  }

  return { attempted: recipients.length, sent, failed, skipped: false };
}
