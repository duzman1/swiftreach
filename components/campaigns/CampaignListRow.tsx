"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  id: string;
  name: string;
  status: string;
  createdAt: string | Date;
  sentCount: number;
  failedCount: number;
  totalCount: number;
}

export function CampaignListRow({
  id,
  name,
  status,
  createdAt,
  sentCount,
  failedCount,
  totalCount,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  async function onDelete(e: React.MouseEvent) {
    // Stop the parent <Link> from navigating when the user clicks the trash icon.
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      toast.success(`Campaign "${name}" deleted`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }

  return (
    <li className="relative">
      <Link
        href={`/campaigns/${id}`}
        className="py-3 -mx-2 px-2 rounded flex items-center justify-between gap-4 hover:bg-zinc-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(createdAt).toLocaleString()} ·{" "}
            {formatNumber(sentCount)}/{formatNumber(totalCount)} sent ·{" "}
            {formatNumber(failedCount)} failed
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={status} />
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete campaign ${name}`}
            title="Delete campaign"
            className="p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </Link>
    </li>
  );
}
