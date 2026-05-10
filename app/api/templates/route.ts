import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { checkTemplateLimit } from "@/lib/usageCheck";
import { isUserSuspended, suspendedResponse } from "@/lib/suspendCheck";
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
    const userId = await requireUserId();
    const templates = await prisma.messageTemplate.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    return handleApiError(err, "GET /api/templates");
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    return handleApiError(err, "POST /api/templates");
  }

  // Admin moderation: refuse template creation for suspended accounts.
  if (await isUserSuspended(userId)) return suspendedResponse();

  let body: CreateTemplateBody;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.name?.trim()) return badRequest("Template name is required");
  if (!body.content?.trim()) return badRequest("Template content is required");

  // Plan limit: free = 3 templates, paid = unlimited.
  const limitCheck = await checkTemplateLimit(userId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: limitCheck.reason,
        upgradeRequired: limitCheck.upgradeRequired,
      },
      { status: 403 }
    );
  }

  try {
    const template = await prisma.messageTemplate.create({
      data: {
        userId,
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
