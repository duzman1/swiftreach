"use client";

import * as React from "react";
import { Pause, Play, Square, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LiveStatus = "starting" | "sending" | "paused" | "cancelled" | "completed" | "error";

interface ProgressEvent {
  type: "started" | "progress" | "paused" | "cancelled" | "completed" | "error";
  total?: number;
  index?: number;
  contactId?: string;
  phone?: string;
  status?: "sent" | "failed" | "skipped" | "invalid" | "cancelled";
  messageId?: string;
  error?: string;
  sent?: number;
  failed?: number;
  message?: string;
  processed?: number;
}

interface Props {
  campaignId: string;
  campaignName: string;
  initialTotal: number;
  onDone?: () => void;
}

export function ProgressPanel({ campaignId, campaignName, initialTotal, onDone }: Props) {
  const [status, setStatus] = React.useState<LiveStatus>("starting");
  const [total, setTotal] = React.useState(initialTotal);
  const [processed, setProcessed] = React.useState(0);
  const [sent, setSent] = React.useState(0);
  const [failed, setFailed] = React.useState(0);
  const [last, setLast] = React.useState<ProgressEvent | null>(null);
  const [current, setCurrent] = React.useState<{ phone: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const startedAt = React.useRef<number>(Date.now());

  // Use fetch + ReadableStream instead of EventSource. EventSource
  // silently swallows non-2xx HTTP responses, which made every early
  // exit in the send route (400 "credentials not set", 403 suspended,
  // 403 plan limit, 404 campaign not found, 401 unauthorized) look
  // like a stuck "sending…" forever. With fetch we see res.status and
  // res.body, so the actual error reaches the UI + console.
  const abortRef = React.useRef<AbortController | null>(null);

  const openStream = React.useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // STEP 4 debug log — confirms this code path ran and the URL is built.
    // eslint-disable-next-line no-console
    console.log("[ProgressPanel] Starting campaign send:", {
      campaignId,
      url: `/api/campaigns/${campaignId}/send`,
    });

    setStatus("sending");
    setError(null);
    startedAt.current = Date.now();

    function handle(name: ProgressEvent["type"], rawData: string) {
      try {
        const data: ProgressEvent = JSON.parse(rawData);
        data.type = name;
        setLast(data);

        if (name === "started") {
          if (data.total) setTotal(data.total);
        } else if (name === "progress") {
          setProcessed((p) => p + 1);
          if (data.status === "sent") setSent((s) => s + 1);
          if (data.status === "failed") setFailed((f) => f + 1);
          if (data.phone) setCurrent({ phone: data.phone });
        } else if (name === "paused") {
          setStatus("paused");
          ac.abort();
        } else if (name === "cancelled") {
          setStatus("cancelled");
          ac.abort();
          onDone?.();
        } else if (name === "completed") {
          setStatus("completed");
          ac.abort();
          onDone?.();
        } else if (name === "error") {
          setStatus("error");
          setError(data.message ?? "Stream error");
          ac.abort();
        }
      } catch {
        /* ignore parse errors */
      }
    }

    void (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/campaigns/${campaignId}/send`, {
          method: "GET",
          signal: ac.signal,
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[ProgressPanel] Send fetch threw:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Network error");
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // eslint-disable-next-line no-console
        console.error("[ProgressPanel] Send failed:", res.status, text);
        setStatus("error");
        setError(
          `Server returned ${res.status}: ${text || "(no error body)"}`
        );
        return;
      }

      if (!res.body) {
        // eslint-disable-next-line no-console
        console.error("[ProgressPanel] Response has no body");
        setStatus("error");
        setError("Server returned no body — cannot stream.");
        return;
      }

      // Parse `event:`/`data:` frames separated by blank lines.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let evType = "message";
            let evData = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) evType = line.slice(6).trim();
              else if (line.startsWith("data:")) evData += line.slice(5).trim();
            }
            handle(evType as ProgressEvent["type"], evData);
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[ProgressPanel] Stream read error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Stream read error");
      }
    })();
  }, [campaignId, onDone]);

  React.useEffect(() => {
    openStream();
    return () => abortRef.current?.abort();
  }, [openStream]);

  async function pause() {
    await fetch(`/api/campaigns/${campaignId}/pause`, { method: "PUT" });
    // The SSE loop checks DB state on the next iteration and emits a 'paused' event.
  }

  async function resume() {
    await fetch(`/api/campaigns/${campaignId}/resume`, { method: "PUT" });
    openStream();
  }

  async function cancel() {
    if (!confirm("Cancel this campaign? Remaining messages will not be sent.")) return;
    await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "PUT" });
    abortRef.current?.abort();
    setStatus("cancelled");
  }

  const pct = total > 0 ? (processed / total) * 100 : 0;
  const elapsedSec = (Date.now() - startedAt.current) / 1000;
  const remaining = total - processed;
  const rate = processed > 0 ? elapsedSec / processed : 0;
  const etaSec = remaining > 0 && rate > 0 ? Math.round(remaining * rate) : 0;

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{campaignName}</div>
          <div className="text-xs text-muted-foreground capitalize">
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === "sending" && (
            <Button variant="outline" size="sm" onClick={pause} className="gap-1">
              <Pause className="w-3.5 h-3.5" /> Pause
            </Button>
          )}
          {status === "paused" && (
            <Button variant="outline" size="sm" onClick={resume} className="gap-1">
              <Play className="w-3.5 h-3.5" /> Resume
            </Button>
          )}
          {(status === "sending" || status === "paused") && (
            <Button variant="destructive" size="sm" onClick={cancel} className="gap-1">
              <Square className="w-3.5 h-3.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              status === "completed" ? "bg-emerald-500" :
              status === "error" || status === "cancelled" ? "bg-red-400" :
              "bg-whatsapp"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{processed}</strong> / {total}
          </span>
          <span>
            {etaSec > 0 && status === "sending" && `~${formatEta(etaSec)} remaining`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <Stat icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Sent" value={sent} />
        <Stat icon={<XCircle className="w-4 h-4 text-red-600" />} label="Failed" value={failed} />
        <Stat icon={<span className="text-amber-600 text-xs">⏭</span>} label="Skipped" value={Math.max(0, total - processed - (sent + failed))} />
      </div>

      {current && status === "sending" && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Last sent to <span className="font-mono">{current.phone}</span>
        </div>
      )}

      {last?.type === "progress" && last.error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          Last error: {last.error}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border p-2 flex items-center gap-2">
      {icon}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground leading-none">{label}</div>
        <div className="font-semibold leading-none mt-1">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LiveStatus }) {
  const colors: Record<LiveStatus, string> = {
    starting: "text-sky-700",
    sending: "text-sky-700",
    paused: "text-amber-700",
    cancelled: "text-zinc-500",
    completed: "text-emerald-700",
    error: "text-red-700",
  };
  return <span className={colors[status]}>{status}</span>;
}

function formatEta(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
