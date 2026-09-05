// GET    — single automation with contacts + recent runs
// PUT    — update automation settings (name, message, schedule, status)
// DELETE — hard-delete (cascade removes contacts + runs)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, assertOwnership } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const automation = await prisma.automation.findUnique({
      where: { id: params.id },
      include: {
        contacts: {
          orderBy: [{ month: "asc" }, { day: "asc" }],
        },
        runs: {
          orderBy: { runDate: "desc" },
          take: 30,
        },
      },
    });
    assertOwnership(automation, userId, "Automation not found");

    return NextResponse.json({ ok: true, automation });
  } catch (err) {
    return handleApiError(err, "GET /api/automations/[id]");
  }
}

interface UpdateBody {
  name?: string;
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  status?: "active" | "paused" | "archived";
  sendHour?: number;
  sendMinute?: number;
  daysBeforeDate?: number;
  timezone?: string;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const existing = await prisma.automation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    assertOwnership(existing, userId, "Automation not found");

    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body.message === "string") data.message = body.message;
    if (typeof body.templateName === "string") {
      data.templateName = body.templateName || null;
    }
    if (typeof body.templateLanguage === "string") {
      data.templateLanguage = body.templateLanguage || "en_US";
    }
    if (
      body.status === "active" ||
      body.status === "paused" ||
      body.status === "archived"
    ) {
      data.status = body.status;
    }
    if (typeof body.sendHour === "number") {
      data.sendHour = Math.max(0, Math.min(23, Math.floor(body.sendHour)));
    }
    if (typeof body.sendMinute === "number") {
      data.sendMinute = Math.max(0, Math.min(59, Math.floor(body.sendMinute)));
    }
    if (typeof body.daysBeforeDate === "number") {
      data.daysBeforeDate = Math.max(
        0,
        Math.min(7, Math.floor(body.daysBeforeDate))
      );
    }
    if (typeof body.timezone === "string" && body.timezone) {
      data.timezone = body.timezone;
    }

    if (Object.keys(data).length === 0) {
      return errorResponse("No fields to update", 400);
    }

    const updated = await prisma.automation.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ ok: true, automation: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/automations/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.automation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    assertOwnership(existing, userId, "Automation not found");

    // Cascade removes AutomationContact + AutomationRun rows —
    // see the onDelete: Cascade relations in schema.prisma.
    await prisma.automation.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/automations/[id]");
  }
}
