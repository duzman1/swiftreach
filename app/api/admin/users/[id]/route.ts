// Admin user CRUD — GET full detail, DELETE with Stripe-cancel-first.
//
// CRITICAL: DELETE must cancel any active Stripe subscription BEFORE deleting
// the User row. If we delete first, we lose the subscription id and the user
// keeps getting charged with no DB record to update.
//
// SECURITY: GET never returns the encrypted token blob — admins see "Connected"
// status only. Decrypted tokens are NEVER exposed in the admin UI.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripePriceId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        messagesUsedThisMonth: true,
        usagePeriodStart: true,
        suspended: true,
        // Status flag only — NEVER expose the encrypted token blob.
        whatsappPhoneNumberId: true,
        whatsappBusinessAccountId: true,
        whatsappApiVersion: true,
        defaultCountryCode: true,
        defaultDelayMs: true,
        onboardingCompletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const [campaignCount, templateCount, hasToken] = await Promise.all([
      prisma.campaign.count({ where: { userId: user.id } }),
      prisma.messageTemplate.count({ where: { userId: user.id } }),
      prisma.user
        .findUnique({ where: { id: user.id }, select: { whatsappApiToken: true } })
        .then((u) => Boolean(u?.whatsappApiToken)),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        ...user,
        whatsappConnected: hasToken && Boolean(user.whatsappPhoneNumberId),
        campaignCount,
        templateCount,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/[id]");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        stripeSubscriptionId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Refuse to delete the admin's own account from the admin panel — they'd
    // lock themselves out and have to fix it via SQL.
    if (user.id === admin.userId) {
      return NextResponse.json(
        { ok: false, error: "Cannot delete your own admin account from here." },
        { status: 400 }
      );
    }

    // ── STEP 1: cancel Stripe subscription (if any) BEFORE the DB delete ──
    // If this fails, abort — better to leave the user row intact than to
    // delete locally and keep charging them on Stripe with no record.
    if (user.stripeSubscriptionId) {
      try {
        await getStripe().subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err: unknown) {
        // If Stripe says it's already canceled, that's fine — proceed.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/no such subscription|already.*canceled/i.test(msg)) {
          return NextResponse.json(
            {
              ok: false,
              error: `Stripe cancel failed — aborting delete: ${msg}`,
            },
            { status: 502 }
          );
        }
      }
    }

    // ── STEP 2: cascade-delete the user (Prisma cascades campaigns +
    // templates via the schema's onDelete: Cascade).
    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/users/[id]");
  }
}
