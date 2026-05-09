"use client";

import * as React from "react";
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
      <ExportCsvButton campaignId={campaignId} campaignName={campaignName} />
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

/**
 * Export CSV via fetch (rather than a plain <a download>) so we can detect
 * the 403 plan-gate response and surface an Upgrade prompt instead of
 * dumping JSON into the browser tab.
 */
function ExportCsvButton({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [exporting, setExporting] = React.useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/export`);
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error ?? "CSV export is not available on your current plan.",
          {
            action: {
              label: "Upgrade",
              onClick: () => {
                window.location.href = "/billing";
              },
            },
          }
        );
        return;
      }
      if (!res.ok) {
        toast.error(`Export failed (HTTP ${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaignName.replace(/[^a-zA-Z0-9._-]+/g, "_")}_results.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setExporting(false);
    }
  }
  return (
    <Button
      variant="outline"
      onClick={exportCsv}
      disabled={exporting}
      className="gap-2"
    >
      {exporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      Export CSV
    </Button>
  );
}
