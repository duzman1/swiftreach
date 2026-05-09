import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CampaignListRow } from "@/components/campaigns/CampaignListRow";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getPlanLimits, getPlanName } from "@/lib/stripe";

export const dynamic = "force-dynamic";

async function loadCampaigns(userId: string, take: number) {
  try {
    return await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      // Free plan caps history at 10. Paid plans pass Infinity → undefined
      // → no limit.
      take: Number.isFinite(take) ? take : undefined,
    });
  } catch {
    return [];
  }
}

async function countAllCampaigns(userId: string) {
  try {
    return await prisma.campaign.count({ where: { userId } });
  } catch {
    return 0;
  }
}

export default async function CampaignsPage() {
  const user = await requireUser();
  const limits = getPlanLimits(user.plan);
  const cap = limits.campaignHistory; // Infinity for paid, 10 for free
  const isCapped = Number.isFinite(cap);

  const [campaigns, totalCount] = await Promise.all([
    loadCampaigns(user.id, cap),
    isCapped ? countAllCampaigns(user.id) : Promise.resolve(0),
  ]);
  const hidden = isCapped ? Math.max(0, totalCount - campaigns.length) : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground mt-1">All sends, past and present.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            {campaigns.length === 0
              ? "No campaigns yet."
              : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Campaigns will appear here once you start one.
            </p>
          ) : (
            <>
              <ul className="divide-y">
                {campaigns.map((c) => (
                  <CampaignListRow
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    status={c.status}
                    createdAt={c.createdAt}
                    sentCount={c.sentCount}
                    failedCount={c.failedCount}
                    totalCount={c.totalCount}
                  />
                ))}
              </ul>
              {hidden > 0 && (
                <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">
                    Showing your <strong>{campaigns.length}</strong> most recent
                    campaigns. <strong>{hidden}</strong> more in your history are
                    hidden on the {getPlanName(user.plan)} plan.
                  </p>
                  <Link href="/billing">
                    <Button size="sm">Upgrade to view all →</Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
