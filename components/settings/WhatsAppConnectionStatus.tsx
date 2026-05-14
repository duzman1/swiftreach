"use client";

// Phase 8 — Settings page connection status. Replaces the old "paste
// your token" form as the FIRST thing the user sees. The manual form
// is still available below an "Advanced — Manual Setup" accordion.

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, AlertTriangle, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  connected: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  // We don't know if the webhook is "active" without calling Meta — so
  // we expose a re-subscribe button that confirms it on demand.
}

export function WhatsAppConnectionStatus({
  connected,
  phoneNumberId,
  businessAccountId,
}: Props) {
  const [subscribing, setSubscribing] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  async function resubscribe() {
    setSubscribing(true);
    try {
      const r = await fetch("/api/whatsapp/subscribe-webhooks", {
        method: "POST",
      });
      const j = await r.json();
      if (r.ok && (j?.ok || j?.success)) {
        toast.success("Webhooks re-subscribed");
      } else {
        toast.error(j?.error ?? "Failed to subscribe webhooks");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubscribing(false);
    }
  }

  async function disconnect() {
    if (
      !confirm(
        "Disconnect WhatsApp? Your stored token will be cleared. You can reconnect at any time."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      // Existing /api/user/settings PUT clears the token when we pass
      // null. No dedicated disconnect endpoint required.
      const r = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappApiToken: null,
          whatsappPhoneNumberId: null,
          whatsappBusinessAccountId: null,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("WhatsApp disconnected");
      // Reload so the connection state re-reads from the server.
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">
              Not connected
            </div>
            <div className="text-xs text-amber-800/80 mt-0.5">
              Connect a WhatsApp Business account to start sending campaigns.
            </div>
          </div>
        </div>
        <Link href="/onboarding">
          <Button className="bg-[#25D366] hover:bg-[#1ea855] text-white">
            Connect WhatsApp Business →
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2 text-emerald-900 font-semibold">
          <Check className="w-5 h-5 text-emerald-600" /> Connected
        </div>
        <dl className="mt-2 space-y-1 text-sm text-emerald-900">
          {phoneNumberId && (
            <div className="flex justify-between gap-3">
              <dt className="text-emerald-800/70">Phone Number ID</dt>
              <dd className="font-mono text-xs">{phoneNumberId}</dd>
            </div>
          )}
          {businessAccountId && (
            <div className="flex justify-between gap-3">
              <dt className="text-emerald-800/70">Business Account ID</dt>
              <dd className="font-mono text-xs">{businessAccountId}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/onboarding">
          <Button variant="outline" className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Reconnect WhatsApp
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={resubscribe}
          disabled={subscribing}
          className="gap-1.5"
        >
          {subscribing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Re-subscribe Webhooks
        </Button>
        <Button
          variant="outline"
          onClick={disconnect}
          disabled={disconnecting}
          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
        >
          {disconnecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Unplug className="w-3.5 h-3.5" />
          )}
          Disconnect
        </Button>
      </div>
    </div>
  );
}
