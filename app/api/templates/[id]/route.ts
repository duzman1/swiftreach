import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/apiResponse";
import type { FormatRule } from "@/lib/buildMessage";

export const dynamic = "force-dynamic";

interface UpdateTemplateBody {
  name?: string;
  description?: string;
  content?: string;
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
  bumpUsage?: boolean;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: params.id },
    });
    if (!template) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    return handleApiError(err, "/api/templates/[id]");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: UpdateTemplateBody;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return badRequest("Template name cannot be empty");
    data.name = body.name.trim();
  }
  if (body.description !== undefined)
    data.description = body.description.trim() || null;
  if (body.content !== undefined) {
    if (!body.content.trim()) return badRequest("Template content cannot be empty");
    data.content = body.content;
  }
  if (body.staticVars !== undefined)
    data.staticVars = JSON.stringify(body.staticVars);
  if (body.formatRules !== undefined)
    data.formatRules = JSON.stringify(body.formatRules);
  if (body.bumpUsage) {
    data.usageCount = { increment: 1 };
    data.lastUsedAt = new Date();
  }

  try {
    const template = await prisma.messageTemplate.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    return handleApiError(err, "/api/templates/[id]");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.messageTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "/api/templates/[id]");
  }
}
