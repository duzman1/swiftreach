import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/apiResponse";
import type { FormatRule } from "@/lib/buildMessage";

export const dynamic = "force-dynamic";

interface CreateTemplateBody {
  name: string;
  description?: string;
  content: string;
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function GET() {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    return handleApiError(err, "GET /api/templates");
  }
}

export async function POST(req: NextRequest) {
  let body: CreateTemplateBody;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.name?.trim()) return badRequest("Template name is required");
  if (!body.content?.trim()) return badRequest("Template content is required");

  try {
    const template = await prisma.messageTemplate.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        content: body.content,
        staticVars: JSON.stringify(body.staticVars ?? {}),
        formatRules: JSON.stringify(body.formatRules ?? {}),
      },
    });
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    return handleApiError(err, "POST /api/templates");
  }
}
