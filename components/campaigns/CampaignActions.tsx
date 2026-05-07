"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { classifyErrors } from "@/lib/translateError";

interface Props {
  campaignId: string;
  campaignName: string;
  failedCount: number;
  // Raw stored errorMessage strings, one per failed contact
  failedErrors?: string[];
}

export function CampaignActions({
  campaignId,
  campaignName,
  failedCount,
  failedErrors = [],
}: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);
  const [retried, setRetried] = React.useState(0);
  const [streaming, setStreaming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function deleteCampaign() {
    if (
      !confirm(
        `Delete campaign "${campaignName}" and all its contact records? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      toast.success(`Campaign "${campaignName}" deleted`);
      router.push("/campaigns");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }

  async function retryFailed() {
    if (failedCount === 0) return;

    // Inspect the failure mix and pick a confirmation message that's actually
    // useful: if every failure is "not on WhatsApp" (131026), retrying won't
    // help — make sure the user knows that before paying for more API calls.
    const { codes, total } = classifyErrors(failedErrors);
    let message = `Retry ${failedCount} failed contact${failedCount === 1 ? "" : "s"}?`;
    if (total > 0 && (codes["131026"] ?? 0) === total) {
      message =
        "These contacts are not on WhatsApp. Retrying will not deliver the message. Do you still want to retry?";
    } else if ((codes["131030"] ?? 0) === total) {
      message =
        "These contacts aren't on your test recipient list. Add them in the Meta dashboard first, otherwise retrying will silently drop the messages. Continue anyway?";
    } else if ((codes["131047"] ?? 0) === total) {
      message =
        "These contacts are outside the 24-hour window. They must message you first, or you must use a Meta-approved template. Continue anyway?";
    }

    if (!confirm(message)) return;

    setRetrying(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retry`, { method: "PUT" });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Retry failed");
        return;
      }
      setRetried(data.retried ?? 0);
      toast.success(`Re-queued ${data.retried} contact${data.retried === 1 ? "" : "s"} — starting now`);

      // Open the SSE stream and consume events until done.
      setStreaming(true);
      const es = new EventSource(`/api/campaigns/${campaignId}/send`);
      let sent = 0, failed = 0;
      es.addEventListener("progress", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.status === "sent") sent++;
          else if (d.status === "failed") failed++;
        } catch { /* ignore */ }
      });
      es.addEventListener("completed", () => {
        es.close();
        setStreaming(false);
        toast.success(`Retry complete — ${sent} sent, ${failed} still failed`);
        router.refresh();
      });
      es.addEventListener("cancelled", () => {
        es.close();
        setStreaming(false);
        router.refresh();
      });
      es.addEventListener("error", () => {
        es.close();
        setStreaming(false);
        router.refresh();
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setStreaming(false);
          router.refresh();
        }
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setRetrying(false);
    }
  }

  const busy = retrying || streaming;

  return (
    <div className="flex items-center gap-2">
      {failedCount > 0 && (
        <Button
          variant="outline"
          onClick={retryFailed}
          disabled={busy}
          className="gap-2"
          title="Re-queue failed contacts and resume sending"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          {streaming
            ? `Retrying ${retried}…`
            : `Retry ${failedCount} failed`}
        </Button>
      )}
      <Link href={`/api/campaigns/${campaignId}/export`} download>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </Link>
      <Button
        variant="destructive"
        onClick={deleteCampaign}
        disabled={busy || deleting}
        className="gap-2"
      >
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
        Delete
      </Button>
    </div>
  );
}
