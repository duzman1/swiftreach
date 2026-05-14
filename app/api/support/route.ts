// User-facing support API.
//   POST — submit a new support request. Validates fields, rate-limits
//          (5/24h per user), generates the per-user reference number,
//          fires admin + customer emails via Resend, stores the row.
//   GET  — return the caller's last 10 support requests for the
//          history block on /support.
//
// Email delivery is best-effort: if RESEND_API_KEY isn't set or a
// send fails, we still persist the request and return the reference
// so the user has SOMETHING to point at. Admins can always see the
// request in /admin/support regardless of email outcome.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

const PRIORITY_EMOJI: Record<Priority, string> = {
  low: "🟢",
  normal: "🟡",
  high: "🟠",
  urgent: "🔴",
};

interface CreateBody {
  category?: string;
  subject?: string;
  message?: string;
  priority?: string;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Strip basic HTML special chars so user input rendered into our email
// templates can't escape into markup. Resend renders our html as-is;
// we don't want a user-submitted </div> tearing up the layout (or worse).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// SR-YYYY-NNN where NNN is THIS USER's personal count + 1, padded.
async function nextReference(userId: string): Promise<string> {
  const count = await prisma.supportRequest.count({ where: { userId } });
  const year = new Date().getUTCFullYear();
  return `SR-${year}-${String(count + 1).padStart(3, "0")}`;
}

// ───────────────────────────────────────────────────────────────────────
// GET — caller's last 10 requests
// ───────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();
    const requests = await prisma.supportRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        reference: true,
        category: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    return handleApiError(err, "GET /api/support");
  }
}

// ───────────────────────────────────────────────────────────────────────
// POST — submit a new request
// ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    let body: CreateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const category = body.category?.trim() ?? "";
    const subject = body.subject?.trim() ?? "";
    const message = body.message?.trim() ?? "";
    const priorityIn = (body.priority ?? "normal").toLowerCase();
    const priority: Priority = (
      VALID_PRIORITIES.includes(priorityIn as Priority)
        ? priorityIn
        : "normal"
    ) as Priority;

    if (!category) return bad("Category is required");
    if (!subject) return bad("Subject is required");
    if (subject.length < 5 || subject.length > 100)
      return bad("Subject must be 5–100 characters");
    if (!message) return bad("Message is required");
    if (message.length < 20)
      return bad("Message must be at least 20 characters");
    if (message.length > 2000)
      return bad("Message must be 2000 characters or fewer");

    // Rate limit — 5 / 24h per user.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.supportRequest.count({
      where: { userId: user.id, createdAt: { gte: since } },
    });
    if (recentCount >= 5) {
      return bad(
        "You've submitted several requests recently. Please wait before submitting another, or email support@swiftreach.app directly.",
        429
      );
    }

    const reference = await nextReference(user.id);
    const supportRequest = await prisma.supportRequest.create({
      data: {
        userId: user.id,
        reference,
        category,
        subject,
        message,
        priority,
        status: "open",
      },
    });

    // ── Email delivery (best-effort) ───────────────────────────────────
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const emoji = PRIORITY_EMOJI[priority];
      const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message);
      const safePlan = escapeHtml(user.plan?.toUpperCase() ?? "FREE");

      try {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);

        // Admin notification (Reply-To = user so the team can hit
        // reply in their inbox).
        await resend.emails.send({
          from: "SwiftReach Support <noreply@swiftreach.app>",
          to: "support@swiftreach.app",
          replyTo: user.email,
          subject: `${emoji} [${reference}] ${subject}`,
          html: adminEmailHtml({
            reference,
            customer: fullName,
            email: user.email,
            plan: safePlan,
            category: escapeHtml(category),
            priority,
            emoji,
            subject: safeSubject,
            message: safeMessage,
          }),
        });

        // User confirmation (sent FROM support@ so a reply-all hits
        // the support team directly).
        await resend.emails.send({
          from: "SwiftReach Support <support@swiftreach.app>",
          to: user.email,
          subject: `[${reference}] We received your request — ${subject}`,
          html: userEmailHtml({
            firstName: user.firstName ?? "there",
            reference,
            category: escapeHtml(category),
            subject: safeSubject,
            message: safeMessage,
            priority,
            emoji,
          }),
        });
      } catch (err) {
        // Non-fatal — surface to admin error log so the team knows the
        // notification didn't go out, but still return success because
        // the row IS in the DB.
        await logError("support email send", err, {
          userId: user.id,
          severity: "warning",
        });
      }
    } else {
      await logError(
        "support email skipped — RESEND_API_KEY not configured",
        new Error("no api key"),
        { userId: user.id, severity: "warning" }
      );
    }

    return NextResponse.json({
      ok: true,
      reference,
      id: supportRequest.id,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/support");
  }
}

// ───────────────────────────────────────────────────────────────────────
// Email templates — kept inline so a missing template file can't break
// the support flow at runtime.
// ───────────────────────────────────────────────────────────────────────

function adminEmailHtml(args: {
  reference: string;
  customer: string;
  email: string;
  plan: string;
  category: string;
  priority: Priority;
  emoji: string;
  subject: string;
  message: string;
}): string {
  return `<div style="font-family: sans-serif; max-width: 600px;">
  <h2 style="color: #25D366; margin-top: 0;">New Support Request</h2>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 8px; font-weight: bold; width: 140px;">Reference:</td>
      <td style="padding: 8px;">${args.reference}</td>
    </tr>
    <tr style="background: #f9f9f9;">
      <td style="padding: 8px; font-weight: bold;">Customer:</td>
      <td style="padding: 8px;">${escapeHtml(args.customer)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold;">Email:</td>
      <td style="padding: 8px;"><a href="mailto:${args.email}">${args.email}</a></td>
    </tr>
    <tr style="background: #f9f9f9;">
      <td style="padding: 8px; font-weight: bold;">Plan:</td>
      <td style="padding: 8px;">${args.plan}</td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold;">Category:</td>
      <td style="padding: 8px;">${args.category}</td>
    </tr>
    <tr style="background: #f9f9f9;">
      <td style="padding: 8px; font-weight: bold;">Priority:</td>
      <td style="padding: 8px;">${args.emoji} ${args.priority.toUpperCase()}</td>
    </tr>
  </table>

  <h3>Subject: ${args.subject}</h3>

  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; border-left: 4px solid #25D366;">
    <p style="margin: 0; white-space: pre-wrap;">${args.message}</p>
  </div>

  <br>
  <p>
    <a href="mailto:${args.email}" style="background: #25D366; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Reply to Customer</a>
  </p>
</div>`;
}

function userEmailHtml(args: {
  firstName: string;
  reference: string;
  category: string;
  subject: string;
  message: string;
  priority: Priority;
  emoji: string;
}): string {
  return `<div style="font-family: sans-serif; max-width: 600px;">
  <div style="background: #25D366; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">SwiftReach Support</h1>
  </div>

  <div style="padding: 24px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
    <h2>We received your support request ✅</h2>
    <p>Hi ${escapeHtml(args.firstName)},</p>
    <p>Thanks for reaching out. We've received your support request and will get back to you within <strong>24 hours</strong>.</p>

    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 8px;"><strong>Reference:</strong> ${args.reference}</p>
      <p style="margin: 0 0 8px;"><strong>Category:</strong> ${args.category}</p>
      <p style="margin: 0 0 8px;"><strong>Subject:</strong> ${args.subject}</p>
      <p style="margin: 0;"><strong>Priority:</strong> ${args.emoji} ${args.priority}</p>
    </div>

    <p>Your message:</p>
    <div style="background: #f9f9f9; padding: 12px; border-radius: 6px; border-left: 3px solid #25D366;">
      <p style="margin: 0; white-space: pre-wrap; color: #555;">${args.message}</p>
    </div>

    <br>
    <p>While you wait, you might find these resources helpful:</p>
    <ul>
      <li><a href="https://www.swiftreach.app/onboarding">Setup Guide</a></li>
      <li><a href="https://www.swiftreach.app/billing">Billing &amp; Plan Info</a></li>
    </ul>

    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

    <p style="color: #888; font-size: 14px;">
      SwiftReach · support@swiftreach.app<br>
      <a href="https://www.swiftreach.app">swiftreach.app</a>
    </p>
  </div>
</div>`;
}
