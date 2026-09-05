// Toggle a single inbound message's read flag. PUT body { read: boolean }.
// Stamps readAt the first time read flips to true; clearing read leaves
// readAt alone (history of when it was first marked read).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    let body: { read?: boolean };
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }
    const read = body.read !== false;

    const existing = await prisma.inboundMessage.findUnique({ where: { id: params.id } });
    if (!existing || existing.userId !== userId) return bad("Message not found", 404);

    const updated = await prisma.inboundMessage.update({
      where: { id: params.id },
      data: {
        read,
        readAt: read && !existing.readAt ? new Date() : existing.readAt,
      },
    });
    return NextResponse.json({ ok: true, message: updated });
  } catch (err) {
    return handleApiError(err, "PUT /api/inbox/[id]/read");
  }
}
