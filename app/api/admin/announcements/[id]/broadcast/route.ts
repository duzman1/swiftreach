// Email broadcast for an existing announcement. Optional — if RESEND_API_KEY
// isn't set, the helper soft-fails and we return ok:true with skipped:true
// so the UI can show "no email service configured" without surfacing an
// error toast.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { broadcastEmail } from "@/lib/broadcastEmail";

export const dynamic = "force-dynamic";

const TYPE_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  info: { bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
};

function renderHtml(message: string, type: string): string {
  const palette = TYPE_PALETTE[type] ?? TYPE_PALETTE.info;
  const safe = message.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1e293b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="padding:24px 28px;background:${palette.bg};border-bottom:3px solid ${palette.border};color:${palette.text}">
      <div style="font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">SwiftReach update</div>
    </div>
    <div style="padding:28px;font-size:15px;line-height:1.6;color:#334155">${safe.replace(/\n/g, "<br>")}</div>
    <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
      <a href="https://www.swiftreach.app" style="color:#4f46e5;text-decoration:none">Open SwiftReach →</a>
    </div>
  </div>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    let body: { subject?: string };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const announcement = await prisma.announcement.findUnique({
      where: { id: params.id },
    });
    if (!announcement) {
      return NextResponse.json({ ok: false, error: "Announcement not found" }, { status: 404 });
    }

    const subject = body.subject?.trim() || "An update from SwiftReach";
    const html = renderHtml(announcement.message, announcement.type);
    const result = await broadcastEmail({
      subject,
      html,
      target: announcement.target as "all" | "free" | "paid",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/announcements/[id]/broadcast");
  }
}
