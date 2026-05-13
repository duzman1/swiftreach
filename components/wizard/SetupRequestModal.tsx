"use client";

// "Done-For-You Setup" modal. Surfaced from Step 1's "Get Help" button.
// On submit it POSTs /api/setup/request, which fires the Resend emails
// (best-effort) and stamps user.setupRequestedAt.

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SetupRequestModal({ open, onClose }: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    try {
      const r = await fetch("/api/setup/request", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Request failed");
      setSubmitted(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
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
              Done-For-You Setup — $149
            </h3>
            <p className="text-sm text-zinc-600 mt-1">
              One-time fee. We do the whole setup for you.
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

        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-whatsapp/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-whatsapp" />
            </div>
            <h4 className="text-lg font-semibold text-zinc-900">Thanks!</h4>
            <p className="text-sm text-zinc-600">
              We&apos;ll contact you within 24 hours to schedule your setup.
            </p>
            <Button onClick={onClose} className="mt-3">
              Got it
            </Button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-zinc-700 leading-relaxed">
                We set up your entire WhatsApp Business API account for you. You
                just need to give us temporary access to your Meta account.
              </p>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">
                What&apos;s included
              </div>
              <ul className="space-y-2 text-sm text-zinc-700">
                {[
                  "Create your Meta Developer account",
                  "Set up your WhatsApp Business app",
                  "Register your phone number",
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

            <div className="text-xs text-zinc-500">
              Turnaround: 1–2 business days
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-zinc-100">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                className="sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={submitting}
                className="flex-1 bg-whatsapp hover:bg-whatsapp-dark text-white gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Request Setup — $149
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
