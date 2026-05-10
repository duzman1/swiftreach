// User detail — server-rendered shell with a client island for tabs + actions.
// Header shows the user's identity and the destructive-action menu; the tabs
// pane fetches its own data so we don't block the page on the activity query.

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { ChevronLeft } from "lucide-react";
import { UserDetailTabs } from "@/components/admin/UserDetailTabs";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export default async function AdminUserDetailPage({ params }: Params) {
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
      whatsappPhoneNumberId: true,
      whatsappBusinessAccountId: true,
      whatsappApiVersion: true,
      defaultCountryCode: true,
      defaultDelayMs: true,
      onboardingCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      // Status flag only — never expose the encrypted blob.
      whatsappApiToken: true,
    },
  });

  if (!user) notFound();

  const whatsappConnected = Boolean(
    user.whatsappApiToken && user.whatsappPhoneNumberId
  );

  // Strip the encrypted token before passing to the client.
  const { whatsappApiToken: _t, ...safeUser } = user;
  void _t;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center text-xs text-slate-500 hover:text-slate-700 mb-2"
        >
          <ChevronLeft className="w-3 h-3 mr-1" /> Back to users
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {user.email}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                "No name on file"}
              {" · "}
              <span className="font-mono text-xs">{user.id}</span>
            </p>
          </div>
          {user.suspended && (
            <span className="inline-block px-3 py-1 text-xs rounded-full bg-red-100 text-red-700 border border-red-200">
              Suspended
            </span>
          )}
        </div>
      </div>

      <UserDetailTabs
        user={{
          ...safeUser,
          whatsappConnected,
          createdAt: safeUser.createdAt.toISOString(),
          updatedAt: safeUser.updatedAt.toISOString(),
          currentPeriodStart: safeUser.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: safeUser.currentPeriodEnd?.toISOString() ?? null,
          usagePeriodStart: safeUser.usagePeriodStart.toISOString(),
          onboardingCompletedAt:
            safeUser.onboardingCompletedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
