import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsBar } from "@/components/shared/StatsBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Send, FileText, Settings, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadDashboardData() {
  try {
    // Use sentAt / deliveredAt timestamps as the source of truth so the
    // delivery rate reflects what actually reached the recipient (via webhook),
    // not just what the Meta API accepted.
    const [campaigns, totalMessages, sent, delivered, recent] = await Promise.all([
      prisma.campaign.count(),
      prisma.contact.count(),
      prisma.contact.count({ where: { sentAt: { not: null } } }),
      prisma.contact.count({ where: { deliveredAt: { not: null } } }),
      prisma.campaign.findMany({
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

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return (
    <div className="space-y-8 max-w-7xl">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SwiftReach Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Send personalized WhatsApp messages at scale with SwiftReach.
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
            description="Upload contacts, build a message, and send."
          />
          <QuickLink
            href="/templates"
            icon={<FileText className="w-5 h-5" />}
            title="Template Library"
            description="Reusable message templates."
          />
          <QuickLink
            href="/settings"
            icon={<Settings className="w-5 h-5" />}
            title="Settings"
            description="API credentials, defaults, webhook URL."
          />
        </div>
      </div>
    </div>
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
