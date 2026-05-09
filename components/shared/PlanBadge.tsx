"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BillingStatus {
  plan: "free" | "starter" | "growth";
  planName: string;
}

const BADGE_COLORS: Record<BillingStatus["plan"], string> = {
  free: "bg-zinc-700 text-zinc-200",
  starter: "bg-sky-600 text-white",
  growth: "bg-amber-500 text-zinc-900",
};

/**
 * Sidebar plan badge. Fetches /api/billing/status once on mount; until the
 * fetch resolves, renders nothing (no flash of "Free" for paid users).
 */
export function PlanBadge() {
  const [status, setStatus] = React.useState<BillingStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setStatus({ plan: data.plan, planName: data.planName });
        }
      } catch {
        /* swallow — not critical for sidebar render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5",
        BADGE_COLORS[status.plan]
      )}
    >
      {status.planName}
    </span>
  );
}
