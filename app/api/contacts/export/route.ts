// Export the user's contact book as CSV. Same filters as GET /api/contacts
// (search / group / status), but no pagination — we stream every match.
//
// Plan-gating: free plan can't export (matches the existing `csvExport`
// limit elsewhere). Premium plans: no limit.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { PLANS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  if (v == null) return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const planLimits = PLANS[user.plan as keyof typeof PLANS]?.limits;
    if (planLimits && !planLimits.csvExport) {
      return NextResponse.json(
        { ok: false, error: "CSV export is a paid-plan feature. Upgrade in Billing." },
        { status: 403 }
      );
    }

    let body: { groupId?: string; status?: string; q?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body — exports everything for this user.
    }

    const where: Prisma.SavedContactWhereInput = { userId: user.id };
    if (body.status === "opted_out") where.optedOut = true;
    if (body.status === "active") where.optedOut = false;
    if (body.groupId) where.groupIds = { contains: body.groupId };
    if (body.q?.trim()) {
      where.OR = [
        { phoneNumber: { contains: body.q.trim(), mode: "insensitive" } },
        { data: { contains: body.q.trim(), mode: "insensitive" } },
      ];
    }

    const contacts = await prisma.savedContact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    // Discover the union of all keys across exported contacts so the CSV
    // has a complete header row.
    const fieldSet = new Set<string>();
    const parsed: Array<{ phone: string; data: Record<string, string>; optedOut: boolean }> = [];
    for (const c of contacts) {
      const data: Record<string, string> = JSON.parse(c.data || "{}");
      Object.keys(data).forEach((k) => fieldSet.add(k));
      parsed.push({ phone: c.phoneNumber, data, optedOut: c.optedOut });
    }
    const fields = Array.from(fieldSet);
    const header = ["phone", ...fields, "opted_out"];

    const lines: string[] = [header.map(csvEscape).join(",")];
    for (const r of parsed) {
      const cells = [r.phone, ...fields.map((f) => r.data[f] ?? ""), r.optedOut ? "true" : "false"];
      lines.push(cells.map(csvEscape).join(","));
    }
    const body_ = lines.join("\n") + "\n";

    return new Response(body_, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/contacts/export");
  }
}
