"use client";

import * as React from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Opens the Stripe Customer Portal in the same tab. Used for "Manage
 * Subscription" / "Update Payment" / "Reactivate" — Stripe handles all of
 * those flows in their own UI.
 */
export function PortalButton({
  label = "Manage Subscription",
  variant = "outline",
}: {
  label?: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const [busy, setBusy] = React.useState(false);
  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/create-portal", { method: "POST" });
      const data = await res.json();
      if (!data.ok || !data.url) {
        toast.error(data.error ?? "Could not open billing portal");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }
  return (
    <Button onClick={open} disabled={busy} variant={variant} className="gap-2">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
      {label}
    </Button>
  );
}
