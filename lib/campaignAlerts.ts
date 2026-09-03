// Runs the full post-campaign alert pipeline for one campaign:
//   1. Load the campaign + contacts (fresh stats)
//   2. Count opt-outs from OptOutLog (accurate — includes post-send
//      opt-outs that only exist as OptOutLog rows, not as skipped
//      Contact rows)
//   3. Call analyzeCampaignPerformance() → list of alerts
//   4. Save alerts to CampaignAlert
//   5. Mark campaign.alertsSentAt = now (idempotency guard)
//   6. Email the user the report (best-effort; failure doesn't undo
//      the DB writes — alerts are still visible in-app)
//   7. Email admin if any alerts are "critical"
//
// Extracted into a helper so it can be called directly by the send
// route (avoiding a fire-and-forget HTTP hop that Vercel serverless
// often kills before it completes) as well as by the /analyze API
// route (for a manual "re-analyse" trigger from the UI).
//
// Idempotent: checks alertsSentAt up front. Safe to call multiple
// times; only the first call does the work.

import { prisma } from "./prisma";
import { logError } from "./errorLog";
import {
  analyzeCampaignPerformance,
  type CampaignStats,
  type PerformanceAlert,
} from "./campaignAnalysis";

interface RunResult {
  ok: boolean;
  alreadyRun?: boolean;
  alertCount?: number;
  hasCritical?: boolean;
  stats?: CampaignStats;
  error?: string;
}

export async function runCampaignAlerts(
  campaignId: string
): Promise<RunResult> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        user: { select: { id: true, email: true } },
        contacts: {
          select: { status: true, phoneNumber: true, errorMessage: true },
        },
      },
    });

    if (!campaign) return { ok: false, error: "Campaign not found" };
    if (!campaign.user)
      return { ok: false, error: "Campaign has no owner" };

    // Idempotency guard — never analyse the same campaign twice.
    if (campaign.alertsSentAt) {
      return { ok: true, alreadyRun: true };
    }

    // ── Gather stats ──────────────────────────────────────
    const contacts = campaign.contacts;
    const sentStatuses = new Set(["sent", "delivered", "read", "failed"]);
    const deliveredStatuses = new Set(["delivered", "read"]);
    const skippedStatuses = new Set(["skipped", "invalid", "cancelled"]);

    // Count opt-outs from OptOutLog — captures both send-time skips
    // (contact was already opted out) and post-send opt-outs (contact
    // received the message and then replied STOP). The Contact model
    // doesn't have an "opted_out" status; skipped rows with errorMessage
    // "Contact has opted out" are also counted here.
    const campaignPhones = Array.from(
      new Set(contacts.map((c) => c.phoneNumber))
    );
    const optOutCount = campaignPhones.length
      ? await prisma.optOutLog.count({
          where: {
            userId: campaign.user.id,
            phoneNumber: { in: campaignPhones },
            createdAt: { gte: campaign.createdAt },
          },
        })
      : 0;

    const stats: CampaignStats = {
      totalCount: contacts.length,
      sentCount: contacts.filter((c) => sentStatuses.has(c.status)).length,
      deliveredCount: contacts.filter((c) => deliveredStatuses.has(c.status))
        .length,
      readCount: contacts.filter((c) => c.status === "read").length,
      failedCount: contacts.filter((c) => c.status === "failed").length,
      skippedCount: contacts.filter((c) => skippedStatuses.has(c.status))
        .length,
      optOutCount,
    };

    // ── Analyse ───────────────────────────────────────────
    const alerts = analyzeCampaignPerformance(stats);

    // ── Persist (transactional: alerts row-inserts + alertsSentAt
    //    stamp go together; either both succeed or neither does,
    //    which keeps the idempotency guard honest) ────────
    await prisma.$transaction([
      ...(alerts.length > 0
        ? [
            prisma.campaignAlert.createMany({
              data: alerts.map((a) => ({
                campaignId,
                userId: campaign.user!.id,
                type: a.type,
                category: a.category,
                title: a.title,
                message: a.message,
                recommendation: a.recommendation ?? null,
                metric: a.metric ?? null,
              })),
            }),
          ]
        : []),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { alertsSentAt: new Date() },
      }),
    ]);

    // ── Email (best-effort — never blocks the response) ───
    const hasCritical = alerts.some((a) => a.type === "critical");
    await sendCampaignEmail({
      userEmail: campaign.user.email,
      campaignName: campaign.name,
      campaignId,
      stats,
      alerts,
      hasCritical,
    });

    if (hasCritical) {
      await sendAdminAlertEmail({
        userEmail: campaign.user.email,
        campaignName: campaign.name,
        criticalAlerts: alerts.filter((a) => a.type === "critical"),
      });
    }

    return {
      ok: true,
      alertCount: alerts.length,
      hasCritical,
      stats,
    };
  } catch (err) {
    // logError's context type only permits {userId?, severity?} —
    // stitch the campaignId into the route label so it still surfaces
    // in the admin error log.
    await logError(`campaignAlerts.run[${campaignId}]`, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Email helpers (lazy-import Resend so an unconfigured environment
//    doesn't pay the cost of loading the SDK) ───────────────────────

async function sendCampaignEmail(params: {
  userEmail: string;
  campaignName: string;
  campaignId: string;
  stats: CampaignStats;
  alerts: PerformanceAlert[];
  hasCritical: boolean;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return; // Soft-fail if Resend not configured.

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "SwiftReach <hello@swiftreach.app>";

  const {
    userEmail,
    campaignName,
    campaignId,
    stats,
    alerts,
    hasCritical,
  } = params;

  const deliveryRate =
    stats.sentCount > 0
      ? ((stats.deliveredCount / stats.sentCount) * 100).toFixed(1)
      : "0";
  const readRate =
    stats.sentCount > 0
      ? ((stats.readCount / stats.sentCount) * 100).toFixed(1)
      : "0";

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: userEmail,
      subject: hasCritical
        ? `⚠️ Campaign Alert: ${campaignName}`
        : `✅ Campaign Complete: ${campaignName}`,
      html: renderCampaignEmailHtml({
        campaignName,
        campaignId,
        stats,
        alerts,
        hasCritical,
        deliveryRate,
        readRate,
      }),
    });
  } catch (err) {
    await logError(`campaignAlerts.email.user[${campaignId}]`, err);
  }
}

async function sendAdminAlertEmail(params: {
  userEmail: string;
  campaignName: string;
  criticalAlerts: PerformanceAlert[];
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "SwiftReach <hello@swiftreach.app>";
  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (!adminEmail) return; // No admin configured — skip.

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: adminEmail,
      subject: `🚨 Campaign Alert: ${params.userEmail} — ${params.campaignName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color:#111;">Critical Campaign Alert</h2>
          <p><strong>User:</strong> ${escapeHtml(params.userEmail)}</p>
          <p><strong>Campaign:</strong> ${escapeHtml(params.campaignName)}</p>
          <p><strong>Issues:</strong></p>
          <ul>
            ${params.criticalAlerts
              .map(
                (a) =>
                  `<li><strong>${escapeHtml(a.title)}</strong>: ${escapeHtml(a.message)}</li>`
              )
              .join("")}
          </ul>
          <p><a href="https://www.swiftreach.app/admin">View in Admin Dashboard</a></p>
        </div>
      `,
    });
  } catch (err) {
    await logError("campaignAlerts.email.admin", err);
  }
}

// ── HTML rendering ───────────────────────────────────────

function alertBorder(type: PerformanceAlert["type"]): string {
  return type === "success"
    ? "#25D366"
    : type === "critical"
      ? "#dc2626"
      : type === "warning"
        ? "#f59e0b"
        : "#3b82f6";
}
function alertBg(type: PerformanceAlert["type"]): string {
  return type === "success"
    ? "#f0fdf4"
    : type === "critical"
      ? "#fef2f2"
      : type === "warning"
        ? "#fffbeb"
        : "#eff6ff";
}

function renderCampaignEmailHtml(params: {
  campaignName: string;
  campaignId: string;
  stats: CampaignStats;
  alerts: PerformanceAlert[];
  hasCritical: boolean;
  deliveryRate: string;
  readRate: string;
}): string {
  const {
    campaignName,
    campaignId,
    stats,
    alerts,
    hasCritical,
    deliveryRate,
    readRate,
  } = params;

  const statCells: Array<[string, number, string]> = [
    ["Sent", stats.sentCount, "#25D366"],
    ["Delivered", stats.deliveredCount, "#16a34a"],
    ["Read", stats.readCount, "#2563eb"],
    ["Failed", stats.failedCount, "#dc2626"],
  ];

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <!-- Header -->
      <div style="background: #25D366; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">
          ${hasCritical ? "⚠️" : "✅"} Campaign Report
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">
          ${escapeHtml(campaignName)}
        </p>
      </div>

      <!-- Stats grid (uses a table for email-client compatibility;
           display:grid isn't supported in most email clients) -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse: collapse; background: #e5e5e5; border: 1px solid #e5e5e5;">
        <tr>
          ${statCells
            .map(
              ([label, value, color]) => `
            <td style="background: white; padding: 20px; text-align: center; border-right: 1px solid #e5e5e5;">
              <div style="font-size: 32px; font-weight: bold; color: ${color}; line-height: 1;">${value}</div>
              <div style="color: #666; font-size: 14px; margin-top: 4px;">${label}</div>
            </td>
          `
            )
            .join("")}
        </tr>
      </table>

      <!-- Rates -->
      <div style="background: #f9f9f9; padding: 16px 24px; border: 1px solid #e5e5e5; border-top: none;">
        <span style="color: #555; font-size: 14px;">
          Delivery rate: <strong>${deliveryRate}%</strong>
        </span>
        <span style="margin: 0 16px; color: #ccc;">|</span>
        <span style="color: #555; font-size: 14px;">
          Read rate: <strong>${readRate}%</strong>
        </span>
      </div>

      <!-- Alerts -->
      <div style="padding: 24px; border: 1px solid #e5e5e5; border-top: none;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">Performance Insights</h2>
        ${
          alerts.length === 0
            ? `<p style="color: #666; font-size: 14px; margin: 0;">No insights to report — campaign had no send activity.</p>`
            : alerts
                .map(
                  (a) => `
          <div style="margin-bottom: 16px; padding: 16px; border-radius: 8px;
                       border-left: 4px solid ${alertBorder(a.type)};
                       background: ${alertBg(a.type)};">
            <p style="margin: 0 0 8px; font-weight: bold; color: #111;">
              ${escapeHtml(a.title)}
            </p>
            <p style="margin: 0 0 8px; color: #555; font-size: 14px;">
              ${escapeHtml(a.message)}
            </p>
            ${
              a.recommendation
                ? `<p style="margin: 0; color: #444; font-size: 13px; font-style: italic;">
                     💡 ${escapeHtml(a.recommendation)}
                   </p>`
                : ""
            }
          </div>
        `
                )
                .join("")
        }
      </div>

      <!-- CTA -->
      <div style="padding: 24px; text-align: center; border: 1px solid #e5e5e5;
                   border-top: none; border-radius: 0 0 12px 12px;">
        <a href="https://www.swiftreach.app/campaigns/${encodeURIComponent(campaignId)}"
           style="background: #25D366; color: white; padding: 12px 32px;
                  border-radius: 8px; text-decoration: none; font-weight: bold;
                  display: inline-block;">
          View Full Campaign Report →
        </a>
      </div>

      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 24px;">
        SwiftReach · <a href="https://www.swiftreach.app" style="color:#25D366;">swiftreach.app</a>
      </p>
    </div>
  `;
}

// Minimal HTML entity escaper. Email templates run untrusted user
// input (campaign names, alert messages built from user data) so
// every substitution has to go through this.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
