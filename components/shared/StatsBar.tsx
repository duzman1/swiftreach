import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "destructive";
}

const ACCENT: Record<NonNullable<Stat["accent"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  destructive: "text-red-600",
};

export function StatsBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className={cn("text-3xl font-bold mt-1", ACCENT[s.accent ?? "default"])}>
              {s.value}
            </div>
            {s.hint && (
              <div className="text-xs text-muted-foreground mt-1">{s.hint}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
