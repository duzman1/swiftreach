import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  if (v == null) return "";
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { contacts: { orderBy: { id: "asc" } } },
    });
    if (!campaign || campaign.userId !== userId) {
      return new Response("Not found", { status: 404 });
    }

    // Determine column set from the first contact's rowData JSON.
    const allColumns = new Set<string>();
    for (const c of campaign.contacts) {
      try {
        const rd = JSON.parse(c.rowData || "{}");
        for (const k of Object.keys(rd)) allColumns.add(k);
      } catch {
        /* skip */
      }
    }
    const dataCols = Array.from(allColumns);
    const headerRow = [
      "Phone Number",
      ...dataCols,
      "Status",
      "WhatsApp Message ID",
      "Sent At",
      "Delivered At",
      "Read At",
      "Error",
    ];

    const lines: string[] = [headerRow.map(csvEscape).join(",")];
    for (const c of campaign.contacts) {
      let rd: Record<string, string> = {};
      try {
        rd = JSON.parse(c.rowData || "{}");
      } catch {
        /* skip */
      }
      const row = [
        c.phoneNumber,
        ...dataCols.map((h) => String(rd[h] ?? "")),
        c.status,
        c.whatsappMsgId ?? "",
        c.sentAt?.toISOString() ?? "",
        c.deliveredAt?.toISOString() ?? "",
        c.readAt?.toISOString() ?? "",
        c.errorMessage ?? "",
      ];
      lines.push(row.map((v) => csvEscape(String(v))).join(","));
    }

    const csv = "﻿" + lines.join("\n"); // BOM for Excel-friendly UTF-8
    const safeName = campaign.name.replace(/[^a-zA-Z0-9._-]+/g, "_");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_results.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/campaigns/[id]/export");
  }
}
