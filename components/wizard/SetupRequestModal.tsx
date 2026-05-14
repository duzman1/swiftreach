"use client";

// "Done-For-You Setup" modal. Phase 8.1 flips the CTA to a paid Stripe
// Checkout: hitting "Pay $149" POSTs /api/billing/setup-service which
// returns a Stripe-hosted checkout URL and the browser hard-redirects
// there. After payment the user is bounced back to
// /onboarding?setup=requested where the success banner renders.
//
// We no longer call /api/setup/request — that route is kept around as
// a no-payment fallback but isn't reachable from this modal anymore.

import * as React from "react";
import { Check, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SetupRequestModal({ open, onClose }: Props) {
  const [loading, setLoading] = React.useState(false);

  if (!open) return null;

  async function handlePayment() {
    setLoading(true);
    try {
      const r = await fetch("/api/billing/setup-service", {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok || !j?.url) {
        throw new Error(
          j?.error ?? "Couldn't start the checkout session."
        );
      }
      // Hard-redirect — Stripe Checkout is hosted, not embedded.
      window.location.href = j.url as string;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start checkout."
      );
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 md:p-8 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-zinc-900">
              Done-For-You WhatsApp Setup
            </h3>
            <p className="text-sm text-zinc-600 mt-1">
              We do the whole setup for you.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">
            What&apos;s included
          </div>
          <ul className="space-y-2 text-sm text-zinc-700">
            {[
              "Create your Meta Developer account",
              "Set up your WhatsApp Business app",
              "Register and verify your phone number",
              "Create and submit your first message template",
              "Connect everything to SwiftReach",
              "Send a test message to confirm it works",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-whatsapp mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
              Price
            </div>
            <div className="font-semibold text-zinc-900 mt-0.5">
              $149 one-time fee
            </div>
          </div>
          <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
              Turnaround
            </div>
            <div className="font-semibold text-zinc-900 mt-0.5">
              1–2 business days
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-zinc-100">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={loading}
            className="flex-1 bg-whatsapp hover:bg-whatsapp-dark text-white gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            Pay $149 — Secure Checkout →
          </Button>
        </div>

        <p className="text-xs text-zinc-500 flex items-center gap-1.5 justify-center">
          <Lock className="w-3 h-3" />
          Secure payment via Stripe. You&apos;ll be contacted within 24 hours
          after payment.
        </p>
      </div>
    </div>
  );
}
