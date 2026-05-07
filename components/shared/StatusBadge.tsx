import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "pending"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "skipped"
  | "invalid"
  | "cancelled"
  | "draft"
  | "paused"
  | "completed";

const STATUS_STYLES: Record<Status, string> = {
  pending: "bg-zinc-200 text-zinc-700 border-transparent",
  sending: "bg-sky-500 text-white border-transparent animate-pulse",
  sent: "bg-emerald-500 text-white border-transparent",
  delivered: "bg-emerald-700 text-white border-transparent",
  read: "bg-teal-500 text-white border-transparent",
  failed: "bg-red-500 text-white border-transparent",
  skipped: "bg-amber-400 text-zinc-900 border-transparent",
  invalid: "bg-orange-500 text-white border-transparent",
  cancelled: "bg-zinc-300 text-zinc-500 border-transparent line-through",
  draft: "bg-zinc-200 text-zinc-700 border-transparent",
  paused: "bg-amber-500 text-white border-transparent",
  completed: "bg-emerald-600 text-white border-transparent",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status as Status) in STATUS_STYLES ? (status as Status) : "pending";
  return (
    <Badge className={cn("capitalize", STATUS_STYLES[key])}>{status}</Badge>
  );
}
