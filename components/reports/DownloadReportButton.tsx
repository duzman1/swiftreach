"use client";

// Trigger a PDF download from POST /api/reports/generate. Two shapes:
//   - <DownloadReportButton campaignId="cid" />   single campaign
//   - <DownloadReportButton range={...} />        date range
//
// UI: primary button + spinner during generation. On success the
// browser saves the file via a temporary object URL. On failure a
// toast surfaces the API error message (Pro-gate, rate-limit,
// validation, etc.).

import * as React from "react";
import { toast } from "sonner";
import { Loader2, FileDown } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = {
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
} & (
  | { campaignId: string; range?: never }
  | { range: { start: string; end: string }; campaignId?: never }
);

export function DownloadReportButton(props: Props) {
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    setBusy(true);
    try {
      const payload =
        "campaignId" in props && props.campaignId
          ? { campaignId: props.campaignId }
          : { range: props.range };
      const r = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // API errors come back as application/json; success as application/pdf.
      const ct = r.headers.get("content-type") ?? "";
      if (!r.ok || !ct.includes("application/pdf")) {
        let msg = `Report generation failed (${r.status})`;
        if (ct.includes("application/json")) {
          const j = await r.json().catch(() => null);
          if (j?.upgradeRequired) {
            toast.error(
              "White-label reports require the Pro plan.",
              { action: { label: "Upgrade", onClick: () => (window.location.href = "/billing") } }
            );
            return;
          }
          if (j?.error) msg = j.error;
        }
        toast.error(msg);
        return;
      }
      const blob = await r.blob();
      // Filename comes from Content-Disposition; extract if present so
      // the saved file matches the server's naming convention.
      const disposition = r.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "campaign-report.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={generate}
      disabled={busy}
      variant={props.variant ?? "outline"}
      size={props.size ?? "default"}
      className={`gap-2 ${props.className ?? ""}`}
    >
      {busy ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating…
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4" />
          {props.label ?? "Download report"}
        </>
      )}
    </Button>
  );
}
