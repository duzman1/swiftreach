// Dashboard usage meter. Server component — reads usage from the user
// record and renders a static, copy-correct progress bar. Color band reflects
// 0-75% (green) / 75-90% (amber) / 90-100% (red). For free users near the
// cap we surface an extra upgrade nudge.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/stripe";

interface Props {
  plan: Plan;
  used: number;
  /** Set on paid plans by the Stripe webhook; null on free or pre-first-payment. */
  resetsAt: Date | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

export function UsageMeter({ plan, used, resetsAt }: Props) {
  const limit = plan.limits.messagesPerMonth;
  const remaining = Math.max(0, limit - used);
  // Same split as the billing page: `percent` (integer) drives the
  // bar width + color-band bucketing; `percentLabel` handles the
  // "<1%" case so 451 / 100,000 doesn't render as "0% used".
  const rawPercent =
    limit > 0 && Number.isFinite(limit)
      ? Math.min(100, (used / limit) * 100)
      : 0;
  const percent = Math.round(rawPercent);
  const percentLabel =
    rawPercent === 0 ? "0%" : rawPercent < 1 ? "<1%" : `${percent}%`;
  const isFree = plan.id === "free";
  const isStarter = plan.id === "starter";
  const showUpgradeLink = isFree || isStarter;

  // Free + at/over 80% → big upgrade nudge.
  const showFreeNudge = isFree && percent >= 80;

  const bandClass =
    percent >= 90
      ? "bg-red-500"
      : percent >= 75
      ? "bg-amber-500"
      : "bg-whatsapp";

  return (
    <Card className="p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">Messages this month</div>
          <div className="text-xs text-muted-foreground">
            Plan: <strong>{plan.name}</strong>
            {resetsAt && <> · Resets {fmtDate(resetsAt)}</>}
          </div>
        </div>
        {showUpgradeLink && (
          <Link href="/billing">
            <Button variant="outline" size="sm">
              Upgrade Plan →
            </Button>
          </Link>
        )}
      </div>

      <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", bandClass)}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{used.toLocaleString()}</strong>
          {" / "}
          {Number.isFinite(limit) ? limit.toLocaleString() : "∞"}
        </span>
        <span>·</span>
        <span>{percentLabel} used</span>
        <span>·</span>
        <span>{remaining.toLocaleString()} remaining</span>
      </div>

      {showFreeNudge && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <strong>You&apos;re almost out of messages.</strong>{" "}
            Upgrade to Starter for 5,000 messages/month.
          </div>
          <Link href="/billing">
            <Button size="sm">Upgrade →</Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
