// Automations list page. Server-rendered — pulls the user's
// automations from Prisma so the page renders without a client
// fetch waterfall. Card interactions (pause/resume) go through
// the api routes via a small client component.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Plus, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAutomationCapacity } from "@/lib/automationLimits";
import { formatMonthDay } from "@/lib/dateUtils";
import { AutomationRowActions } from "@/components/automations/AutomationRowActions";
import { Button } from "@/components/ui/button";
import {
  classifyAutomationsForPlan,
  type AutomationBlockReason,
} from "@/lib/automationEngine";
import { checkMessageLimit } from "@/lib/usageCheck";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await requireUser();

  if (!user.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const [automations, capacity, limitCheck] = await Promise.all([
    prisma.automation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { contacts: true } },
      },
    }),
    getAutomationCapacity(user.id, user.plan),
    checkMessageLimit(user.id, 1),
  ]);

  // Derived block state — kept out of the DB so it clears
  // automatically on plan upgrade or on the calendar-month reset.
  // Same logic the engine uses in runDailyAutomations, so what the
  // user sees here matches what actually fires.
  const nonArchived = automations.filter((a) => a.status !== "archived");
  const verdict = classifyAutomationsForPlan(nonArchived, user.plan);
  const messageLimitReached =
    !limitCheck.allowed && !!limitCheck.upgradeRequired;
  const blockOf = (
    id: string,
    status: string
  ): AutomationBlockReason | null => {
    const planBlock = verdict.get(id) ?? null;
    if (planBlock) return planBlock;
    if (status === "active" && messageLimitReached) return "over_message_limit";
    return null;
  };

  const hasAny = automations.length > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
          <p className="text-muted-foreground mt-1">
            Send WhatsApp messages to your contacts on their birthday,
            anniversary, or any recurring yearly date — automatically.
          </p>
        </div>
        {hasAny && (
          <CreateCta
            canCreate={capacity.canCreate}
            plan={capacity.plan}
            usedCount={capacity.usedCount}
            limit={capacity.limit}
          />
        )}
      </header>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        <strong>Send window:</strong> Messages send between 5am–9am in
        your recipients&apos; local time zone (US). If your contacts are
        outside the US, timing will shift accordingly.
      </div>

      {!hasAny ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">
            No automations yet
          </h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto">
            Birthday and anniversary automations send personalized WhatsApp
            messages to your contacts on their special day — every year,
            automatically.
          </p>
          <div className="mt-5">
            <CreateCta
              canCreate={capacity.canCreate}
              plan={capacity.plan}
              usedCount={capacity.usedCount}
              limit={capacity.limit}
            />
          </div>
          {!capacity.canCreate && capacity.limit === 0 && (
            <p className="mt-3 text-xs text-zinc-500">
              Automations require a paid plan.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const typeIcon =
              a.type === "birthday"
                ? "🎂"
                : a.type === "anniversary"
                  ? "💍"
                  : "📅";
            const contactCount = a._count.contacts;
            const block = blockOf(a.id, a.status);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="text-2xl leading-none pt-0.5">{typeIcon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/automations/${a.id}`}
                        className="font-semibold text-zinc-900 hover:text-whatsapp truncate"
                      >
                        {a.name}
                      </Link>
                      {block ? (
                        <BlockedPill reason={block} />
                      ) : (
                        <StatusPill status={a.status} />
                      )}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">
                      {contactCount} contact
                      {contactCount === 1 ? "" : "s"} · Sends at{" "}
                      {formatSendTime(a.sendHour, a.sendMinute)} ·{" "}
                      {a.type.replace("_", " ")}
                    </div>
                    {block ? (
                      <div className="mt-1 text-xs text-amber-800 flex items-start gap-1.5">
                        <Lock className="w-3 h-3 mt-[3px] shrink-0" />
                        <span>
                          {blockReasonLine(block)}{" "}
                          <Link
                            href="/billing"
                            className="underline hover:text-amber-900"
                          >
                            Upgrade
                          </Link>{" "}
                          to resume.
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {a.lastRunAt ? (
                          <>
                            Last run:{" "}
                            {new Date(a.lastRunAt).toLocaleDateString()} ·{" "}
                            {a.totalSent} message
                            {a.totalSent === 1 ? "" : "s"} sent all-time
                          </>
                        ) : (
                          <>Awaiting first matching date</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <AutomationRowActions
                  automationId={a.id}
                  status={a.status}
                  contactCount={contactCount}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateCta({
  canCreate,
  plan,
  usedCount,
  limit,
}: {
  canCreate: boolean;
  plan: string;
  usedCount: number;
  limit: number;
}) {
  if (canCreate) {
    return (
      <Link href="/automations/new">
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Create Automation
        </Button>
      </Link>
    );
  }
  if (limit === 0) {
    return (
      <Link href="/billing">
        <Button className="gap-2">Upgrade to enable</Button>
      </Link>
    );
  }
  return (
    <div className="text-right">
      <div className="text-xs text-amber-700">
        {usedCount} of {limit} used on {plan}
      </div>
      <Link href="/billing" className="text-xs underline hover:text-amber-900">
        Upgrade to add more
      </Link>
    </div>
  );
}

// Rendered in place of StatusPill when derived block-state is set.
// The DB row stays status="active" — this pill is purely a read-time
// signal so it clears the moment the user upgrades or the calendar
// month rolls over.
function BlockedPill({ reason }: { reason: AutomationBlockReason }) {
  const shortLabel: Record<AutomationBlockReason, string> = {
    type_gated: "Paused — requires Growth",
    over_count_cap: "Paused — over plan cap",
    over_message_limit: "Paused — message limit",
  };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide bg-amber-50 text-amber-800 border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {shortLabel[reason]}
    </span>
  );
}

// Full-sentence copy shown under the card. Kept next to BlockedPill
// so a new block-reason only needs its copy defined in one place.
function blockReasonLine(reason: AutomationBlockReason): string {
  switch (reason) {
    case "type_gated":
      return "Birthday and anniversary automations require Growth.";
    case "over_count_cap":
      return "This automation is over your current plan's cap and won't run.";
    case "over_message_limit":
      return "Your monthly message limit is reached — resets on the 1st.";
  }
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    archived: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  const dots: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-amber-500",
    archived: "bg-zinc-400",
  };
  const tone = tones[status] ?? tones.paused;
  const dot = dots[status] ?? dots.paused;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${tone}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function formatSendTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  const mm = minute.toString().padStart(2, "0");
  return `${h12}:${mm} ${suffix}`;
}

// Re-export so TypeScript is happy about the unused import warning
// suppression (we call formatMonthDay in the row-actions client
// component's rendered subtitle in a later polish pass, but not here).
void formatMonthDay;
