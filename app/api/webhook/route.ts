// WhatsApp webhook endpoint.
// GET  — verification handshake (returns hub.challenge if verify_token matches)
// POST — delivery / read receipts and inbound messages.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function readVerifyToken(): string {
  return (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "").trim();
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = readVerifyToken();
  if (!expected) {
    return new Response("WHATSAPP_WEBHOOK_VERIFY_TOKEN not set", { status: 500 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipient_id?: string;
  timestamp?: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: StatusUpdate[];
      };
    }>;
  }>;
}

export async function POST(req: NextRequest) {
  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const statuses: StatusUpdate[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        statuses.push(s);
      }
    }
  }

  // Update each Contact by whatsappMsgId. Best-effort; ignore unknown IDs
  // (could be a stale webhook or message sent outside this app).
  for (const s of statuses) {
    try {
      const updates: Record<string, unknown> = { status: s.status };
      if (s.status === "delivered") updates.deliveredAt = new Date();
      if (s.status === "read") {
        updates.deliveredAt = updates.deliveredAt ?? new Date();
        updates.readAt = new Date();
      }
      if (s.status === "failed" && s.errors?.[0]) {
        updates.errorMessage = `[${s.errors[0].code}] ${s.errors[0].title}${
          s.errors[0].message ? ` — ${s.errors[0].message}` : ""
        }`;
      }
      await prisma.contact.updateMany({
        where: { whatsappMsgId: s.id },
        data: updates,
      });
    } catch {
      // continue
    }
  }

  // Always 200 — Meta retries on non-2xx, which is rarely what we want.
  return NextResponse.json({ ok: true });
}
