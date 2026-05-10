// System health pings — DB, Stripe, Clerk, Meta. Each one is a cheap probe
// (read-only, no side effects) so the System page can call this on every
// reload without burning quota.
//
// SECURITY: never include the actual key/token values in the response —
// only "configured: true|false" + the result of the probe call.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface HealthCheck {
  service: string;
  ok: boolean;
  configured: boolean;
  detail?: string;
  ms?: number;
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t };
}

export async function GET() {
  try {
    await requireAdmin();

    const checks: HealthCheck[] = [];

    // ── Postgres ────────────────────────────────────────────────────────
    try {
      const { ms } = await timeIt(() => prisma.$queryRaw`SELECT 1`);
      checks.push({
        service: "Postgres (Neon)",
        ok: true,
        configured: true,
        ms,
      });
    } catch (err) {
      checks.push({
        service: "Postgres (Neon)",
        ok: false,
        configured: Boolean(process.env.DATABASE_URL),
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Stripe ──────────────────────────────────────────────────────────
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const { ms } = await timeIt(async () => {
          // Cheapest authenticated read — list 1 account.
          const list = await getStripe().products.list({ limit: 1 });
          return list.data.length;
        });
        checks.push({
          service: "Stripe API",
          ok: true,
          configured: true,
          ms,
        });
      } catch (err) {
        checks.push({
          service: "Stripe API",
          ok: false,
          configured: true,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      checks.push({
        service: "Stripe API",
        ok: false,
        configured: false,
        detail: "STRIPE_SECRET_KEY not set",
      });
    }

    // ── Clerk ───────────────────────────────────────────────────────────
    // currentUser() inside requireAdmin() already proved Clerk works for THIS
    // request. If we got here, Clerk is healthy.
    checks.push({
      service: "Clerk",
      ok: true,
      configured: Boolean(process.env.CLERK_SECRET_KEY),
    });

    // ── Meta WhatsApp Cloud API ─────────────────────────────────────────
    // We can't probe this generically — every user has their own token. Just
    // report "configured" if at least one user has stored credentials.
    const usersWithMeta = await prisma.user.count({
      where: {
        AND: [
          { whatsappApiToken: { not: null } },
          { whatsappPhoneNumberId: { not: null } },
        ],
      },
    });
    checks.push({
      service: "Meta WhatsApp (per-user)",
      ok: usersWithMeta > 0,
      configured: usersWithMeta > 0,
      detail: `${usersWithMeta} user(s) connected`,
    });

    // ── Resend (optional) ───────────────────────────────────────────────
    checks.push({
      service: "Resend (email broadcast)",
      ok: Boolean(process.env.RESEND_API_KEY),
      configured: Boolean(process.env.RESEND_API_KEY),
      detail: process.env.RESEND_API_KEY
        ? "API key set"
        : "Optional — broadcasts will soft-fail without it",
    });

    return NextResponse.json({ ok: true, checks });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/system/health");
  }
}
