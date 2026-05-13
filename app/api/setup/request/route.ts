// "Get Help Setting Up" — done-for-you request. Emails the admin
// allowlist (first email) AND the user, then stamps setupRequestedAt
// so the admin can surface it in /admin/users.
//
// Email is best-effort: if RESEND_API_KEY is missing or the send fails
// for any reason, we still set the timestamp and return ok so the user
// gets the confirmation modal. The admin can also see the timestamp in
// /admin/users/[id] as a fallback.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

const FROM = process.env.RESEND_FROM_EMAIL?.trim() || "SwiftReach <hello@swiftreach.app>";

function firstAdminEmail(): string | null {
  return (
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? null
  );
}

export async function POST() {
  try {
    const user = await requireUser();

    const adminTo = firstAdminEmail();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";

    // Stamp the request first so it's always recorded, even if email fails.
    await prisma.user.update({
      where: { id: user.id },
      data: { setupRequestedAt: new Date() },
    });

    if (apiKey && adminTo) {
      // Lazy-import so a missing key doesn't pay the SDK boot cost.
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);

      // Admin notification.
      try {
        await resend.emails.send({
          from: FROM,
          to: adminTo,
          subject: "New Done-For-You Setup Request",
          replyTo: user.email,
          html: `
<h2>New Setup Request</h2>
<p><strong>User:</strong> ${displayName}</p>
<p><strong>Email:</strong> <a href="mailto:${user.email}">${user.email}</a></p>
<p><strong>Plan:</strong> ${user.plan}</p>
<p><strong>Signed up:</strong> ${new Date(user.createdAt).toISOString()}</p>
<p><strong>Wizard step reached:</strong> ${user.wizardStep} / 7</p>
<br>
<p>Reply to this email to contact the user — the Reply-To header is set to their address.</p>
          `.trim(),
        });
      } catch (err) {
        await logError("setup-request admin email", err, {
          userId: user.id,
          severity: "warning",
        });
      }

      // User confirmation.
      try {
        await resend.emails.send({
          from: FROM,
          to: user.email,
          subject: "Your SwiftReach Setup Request",
          html: `
<h2>We received your setup request!</h2>
<p>Hi ${user.firstName ?? "there"},</p>
<p>Thanks for requesting our Done-For-You setup service. We'll contact you within 24 hours to get started.</p>
<p>In the meantime, feel free to explore SwiftReach at <a href="https://www.swiftreach.app">swiftreach.app</a>.</p>
<br>
<p>— The SwiftReach Team</p>
          `.trim(),
        });
      } catch (err) {
        await logError("setup-request user email", err, {
          userId: user.id,
          severity: "warning",
        });
      }
    } else {
      // No email infrastructure configured. Log a warning so the admin sees
      // the request even without a Resend account.
      await logError(
        "setup-request: RESEND_API_KEY or ADMIN_EMAILS not configured",
        new Error("email not sent"),
        { userId: user.id, severity: "warning" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "POST /api/setup/request");
  }
}
