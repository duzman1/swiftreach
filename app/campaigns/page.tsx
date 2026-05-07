import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignListRow } from "@/components/campaigns/CampaignListRow";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadCampaigns() {
  try {
    return await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });
  } catch {
    return [];
  }
}

export default async function CampaignsPage() {
  const campaigns = await loadCampaigns();

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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
