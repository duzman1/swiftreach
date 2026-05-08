// Clerk lifecycle webhook. Clerk POSTs here for user.created / user.updated /
// user.deleted events; we mirror those into our Postgres `User` table so the
// rest of the app can use Postgres as its source of truth.
//
// Signature verification uses svix (Clerk's webhook delivery infra). The
// signing secret comes from CLERK_WEBHOOK_SECRET in the env — get it from
// the Webhooks page in the Clerk dashboard.

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import type { WebhookEvent } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith("whsec_")) {
    // Don't 500 — Clerk will retry forever. Return 200 with a soft-fail so
    // the dashboard shows the issue but we don't get stuck in retry loops.
    // eslint-disable-next-line no-console
    console.error(
      "CLERK_WEBHOOK_SECRET not configured — skipping user-sync webhook."
    );
    return NextResponse.json({ ok: false, skipped: "no secret configured" });
  }

  // Headers svix needs to verify the payload signature.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return bad(400, "Missing svix headers");
  }

  const rawBody = await req.text();
  let event: WebhookEvent;
  try {
    event = new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Clerk webhook signature failed:", err);
    return bad(400, "Invalid signature");
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      const data = event.data;
      const email = data.email_addresses?.[0]?.email_address ?? "";
      const firstName = data.first_name ?? null;
      const lastName = data.last_name ?? null;

      // Upsert — handles both create and update, and gracefully recovers if
      // a user.created event was missed but user.updated fires later.
      await prisma.user.upsert({
        where: { id: data.id },
        update: { email, firstName, lastName },
        create: { id: data.id, email, firstName, lastName },
      });
    } else if (event.type === "user.deleted") {
      // Best-effort delete. Cascade in schema removes their campaigns +
      // templates automatically (onDelete: Cascade on the userId relation).
      const id = event.data.id;
      if (id) {
        try {
          await prisma.user.delete({ where: { id } });
        } catch {
          // Already gone — no-op.
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Clerk webhook handler error:", err);
    return bad(500, "Handler error");
  }
}
