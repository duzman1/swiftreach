"use client";

// Row-level actions on the automations list card. Kept as a small
// client island so the list page itself stays server-rendered.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  automationId: string;
  status: string;
  contactCount: number;
}

export function AutomationRowActions({
  automationId,
  status,
  contactCount,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "toggle" | "delete">(null);

  async function togglePause() {
    setBusy("toggle");
    try {
      const res = await fetch(`/api/automations/${automationId}/pause`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Failed to update automation");
        return;
      }
      toast.success(
        data.automation.status === "active"
          ? "Automation resumed"
          : "Automation paused"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAutomation() {
    if (
      !confirm(
        `Delete this automation and all ${contactCount} contact${contactCount === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Failed to delete");
        setBusy(null);
        return;
      }
      toast.success("Automation deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusy(null);
    }
  }

  if (status === "archived") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <Link href={`/automations/${automationId}`}>
          <Button variant="outline" size="sm">
            View
          </Button>
        </Link>
        <Button
          variant="destructive"
          size="sm"
          onClick={deleteAutomation}
          disabled={busy !== null}
          className="gap-1"
        >
          {busy === "delete" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Link href={`/automations/${automationId}`}>
        <Button variant="outline" size="sm">
          View
        </Button>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={togglePause}
        disabled={busy !== null}
        className="gap-1"
      >
        {busy === "toggle" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === "active" ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {status === "active" ? "Pause" : "Resume"}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={deleteAutomation}
        disabled={busy !== null}
        className="gap-1"
      >
        {busy === "delete" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        Delete
      </Button>
    </div>
  );
}
