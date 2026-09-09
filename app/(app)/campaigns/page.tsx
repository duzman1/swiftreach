import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignsListClient } from "@/components/campaigns/CampaignsListClient";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getPlanLimits, getPlanName } from "@/lib/stripe";
import { ClientFilter } from "@/components/clients/ClientFilter";
import { hasFeature } from "@/lib/plans";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function loadCampaigns(
  userId: string,
  take: number,
  clientFilter: Prisma.CampaignWhereInput
) {
  try {
    return await prisma.campaign.findMany({
      where: { userId, ...clientFilter },
      orderBy: { createdAt: "desc" },
      // Free plan caps history at 10. Paid plans pass Infinity → undefined
      // → no limit.
      take: Number.isFinite(take) ? take : undefined,
      include: { client: { select: { id: true, name: true, color: true } } },
    });
  } catch {
    return [];
  }
}

async function countAllCampaigns(
  userId: string,
  clientFilter: Prisma.CampaignWhereInput
) {
  try {
    return await prisma.campaign.count({ where: { userId, ...clientFilter } });
  } catch {
    return 0;
  }
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: { clientId?: string };
}) {
  const user = await requireUser();
  const limits = getPlanLimits(user.plan);
  const cap = limits.campaignHistory; // Infinity for paid, 10 for free
  const isCapped = Number.isFinite(cap);

  // Client filter — only respected for Pro. Below-Pro users won't
  // see the filter control (ClientFilter self-hides when the
  // /api/clients call returns empty/403), so a hand-crafted URL
  // param on those plans just silently no-ops here.
  const rawClient = searchParams?.clientId ?? "";
  const canFilter = hasFeature(user.plan, "perClientReporting");
  const clientFilter: Prisma.CampaignWhereInput =
    canFilter && rawClient === "unassigned"
      ? { clientId: null }
      : canFilter && rawClient
        ? { clientId: rawClient }
        : {};

  const [campaigns, totalCount, unfilteredTotal] = await Promise.all([
    loadCampaigns(user.id, cap, clientFilter),
    isCapped ? countAllCampaigns(user.id, clientFilter) : Promise.resolve(0),
    // Unfiltered count is used ONLY for the "labelled campaigns
    // don't exist, but unlabelled ones do" empty state. Skip the
    // extra query when no filter is active — the campaigns array
    // itself already tells us the state.
    canFilter && rawClient
      ? countAllCampaigns(user.id, {})
      : Promise.resolve(0),
  ]);
  const hidden = isCapped ? Math.max(0, totalCount - campaigns.length) : 0;

  // Plain-serialisable rows the client component can render + mutate.
  const initialRows = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    totalCount: c.totalCount,
    client: c.client
      ? { id: c.client.id, name: c.client.name, color: c.client.color }
      : null,
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground mt-1">All sends, past and present.</p>
        </div>
        <ClientFilter />
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
          <CampaignsListClient
            initialRows={initialRows}
            canUseClients={canFilter}
            activeClientFilter={rawClient}
            unfilteredTotal={unfilteredTotal}
            hidden={hidden}
            planName={getPlanName(user.plan)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
