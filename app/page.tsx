import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsBar } from "@/components/shared/StatsBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { Send, FileText, Settings, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/stripe";
import { formatNumber, formatPercent } from "@/lib/utils";
import { LandingPage } from "@/components/LandingPage";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { AppShell } from "@/components/shared/AppShell";

export const dynamic = "force-dynamic";

// Per-user dashboard stats. The `userId` filter is applied to each query so
// users only see their own campaigns / messages.
async function loadDashboardData(userId: string) {
  try {
    const [campaigns, totalMessages, sent, delivered, recent] = await Promise.all([
      prisma.campaign.count({ where: { userId } }),
      prisma.contact.count({ where: { campaign: { userId } } }),
      prisma.contact.count({
        where: { sentAt: { not: null }, campaign: { userId } },
      }),
      prisma.contact.count({
        where: { deliveredAt: { not: null }, campaign: { userId } },
      }),
      prisma.campaign.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return { campaigns, totalMessages, sent, delivered, recent };
  } catch {
    return {
      campaigns: 0,
      totalMessages: 0,
      sent: 0,
      delivered: 0,
      recent: [] as Awaited<ReturnType<typeof prisma.campaign.findMany>>,
    };
  }
}

export default async function HomePage() {
  const { userId } = await auth();

  // Logged-out: public landing page.
  if (!userId) {
    return <LandingPage />;
  }

  // Logged-in: load user (creates the row if Clerk webhook missed it).
  const user = await requireUser();

  // Belt-and-suspenders against Clerk's NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
  // not being set: if the user hasn't been through onboarding yet, send them
  // there. Both Save and Skip mark this complete, so we don't loop.
  if (!user.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const data = await loadDashboardData(user.id);
  const whatsappConnected = Boolean(
    user.whatsappApiToken && user.whatsappPhoneNumberId
  );
  const plan = getPlan(user.plan);

  // The dashboard at `/` lives outside the (app) route group (route groups
  // can't share a URL with the root page), so we wrap its own chrome here.
  // (app)/* routes get chrome from app/(app)/layout.tsx instead.
  return (
    <AppShell>
    <div className="space-y-8 max-w-7xl">
      <ConnectionBanner show={!whatsappConnected} />

      <UsageMeter
        plan={plan}
        used={user.messagesUsedThisMonth}
        resetsAt={user.currentPeriodEnd}
      />

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SwiftReach Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Send compliant, personalized WhatsApp Business campaigns to opted-in customers.
          </p>
        </div>
        <Link href="/send">
          <Button size="lg" className="gap-2">
            <Send className="w-4 h-4" />
            New Campaign
          </Button>
        </Link>
      </header>

      <StatsBar
        stats={[
          { label: "Total Campaigns", value: formatNumber(data.campaigns) },
          { label: "Messages Sent", value: formatNumber(data.sent), accent: "success" },
          {
            label: "Delivery Rate",
            value: formatPercent(data.delivered, data.sent),
            hint: `${formatNumber(data.delivered)} delivered`,
          },
          { label: "Total Contacts", value: formatNumber(data.totalMessages) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Your last 5 campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y">
                {data.recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="py-3 -mx-2 px-2 rounded flex items-center justify-between gap-4 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()} ·{" "}
                          {formatNumber(c.sentCount)}/{formatNumber(c.totalCount)} sent
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4">
          <QuickLink
            href="/send"
            icon={<Send className="w-5 h-5" />}
            title="New Campaign"
            description="Upload contacts, build a campaign, and reach your opted-in customers."
          />
          <QuickLink
            href="/templates"
            icon={<FileText className="w-5 h-5" />}
            title="Template Library"
            description="Reusable campaign templates for opted-in customers."
          />
          <QuickLink
            href="/settings"
            icon={<Settings className="w-5 h-5" />}
            title="Settings"
            description="Manage your WhatsApp Business connection, sending defaults, and webhook settings."
          />
        </div>
      </div>
    </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      <div className="bg-whatsapp/10 rounded-full p-4 mb-4">
        <MessageCircle className="w-8 h-8 text-whatsapp" />
      </div>
      <h3 className="font-medium">No campaigns yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Upload a contact file to get started. The app reads your column headers
        and turns each one into an insertable variable.
      </p>
      <Link href="/send" className="mt-4">
        <Button>Create your first campaign</Button>
      </Link>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-whatsapp transition-colors cursor-pointer">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="bg-whatsapp/10 text-whatsapp rounded-md p-2">{icon}</div>
          <div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
