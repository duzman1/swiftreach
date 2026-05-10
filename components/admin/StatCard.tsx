// Compact stat tile for the admin overview. Shaded delta chip is optional —
// pass `delta` to show "+12 last 7 days" or similar under the headline number.

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "success";
}

export function StatCard({ label, value, delta, icon: Icon, tone = "default" }: StatCardProps) {
  const tones: Record<NonNullable<StatCardProps["tone"]>, string> = {
    default: "border-slate-200 bg-white",
    warning: "border-amber-200 bg-amber-50",
    success: "border-emerald-200 bg-emerald-50",
  };
  return (
    <div className={cn("rounded-lg border p-5 shadow-sm", tones[tone])}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {delta && <div className="mt-1 text-xs text-slate-500">{delta}</div>}
    </div>
  );
}
