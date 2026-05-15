// Per-key revoke. We don't hard-delete the row — we set isActive=false
// + revokedAt so existing WebhookLog FKs stay intact. The
// authenticateApiKey filter in lib/apiKeys.ts ignores inactive rows,
// so revocation takes effect immediately on the next request.

import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
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
    await prisma.apiKey.update({
      where: { id: params.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    return successResponse({ revoked: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/api-keys/[id]");
  }
}
