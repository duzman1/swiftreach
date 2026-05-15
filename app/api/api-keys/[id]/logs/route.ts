// Per-key webhook log viewer for /settings/api-keys → "View Usage Logs".

import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const key = await prisma.apiKey.findUnique({
      where: { id: params.id },
    });
    if (!key || key.userId !== user.id) {
      return errorResponse("API key not found", 404);
    }

    const url = new URL(req.url);
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") ?? "1", 10) || 1
    );

    const [total, logs] = await Promise.all([
      prisma.webhookLog.count({ where: { apiKeyId: params.id } }),
      prisma.webhookLog.findMany({
        where: { apiKeyId: params.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          phoneNumber: true,
          messageType: true,
          templateName: true,
          status: true,
          errorMessage: true,
          whatsappMsgId: true,
          responseTimeMs: true,
          createdAt: true,
        },
      }),
    ]);

    return successResponse({
      logs,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/api-keys/[id]/logs");
  }
}
