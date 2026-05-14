"use client";

// Three-card chooser shown at /onboarding by default. Embedded Signup
// is the primary CTA; Manual + Done-For-You are equal-weight outlines.
//
// On successful Embedded Signup we swap the cards for the post-connect
// summary (phone, business name, webhook status, two CTAs). The user
// stays on /onboarding the whole time — no premature redirects.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  HelpCircle,
  Sparkles,
  Wrench,
} from "lucide-react";
import { EmbeddedSignup } from "@/components/wizard/EmbeddedSignup";
import { SetupRequestModal } from "@/components/wizard/SetupRequestModal";

interface ConnectedState {
  phoneNumberId: string;
  wabaId: string;
  phoneNumber?: string;
  verifiedName?: string;
  webhookSubscribed?: boolean;
}

export function ConnectChooser() {
  const router = useRouter();
  const [dfyOpen, setDfyOpen] = React.useState(false);
  const [connected, setConnected] = React.useState<ConnectedState | null>(null);

  // Post-success screen — replaces the three cards once the user
  // completes the embedded signup flow.
  if (connected) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-8 md:p-10 text-center space-y-5">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl md:text-3xl font-bold text-zinc-900">
          WhatsApp Connected!
        </h2>
        <ul className="max-w-md mx-auto text-left space-y-1.5 text-sm text-zinc-700">
          {connected.phoneNumber && (
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              Phone number: <strong>{connected.phoneNumber}</strong>
            </li>
          )}
          {connected.verifiedName && (
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              Business account: <strong>{connected.verifiedName}</strong>
            </li>
          )}
          <li className="flex items-center gap-2">
            <Check
              className={`w-4 h-4 shrink-0 ${
                connected.webhookSubscribed
                  ? "text-emerald-600"
                  : "text-amber-600"
              }`}
            />
            Webhooks{" "}
            {connected.webhookSubscribed
              ? "configured"
              : "subscribe pending — try Reconnect later if needed"}
          </li>
        </ul>
        <p className="text-sm text-zinc-600 max-w-md mx-auto">
          One last thing — you need a Meta-approved message template
          before you can send campaigns.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={() => router.push("/onboarding?mode=manual")}
            className="px-5 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ea855] text-white text-sm font-semibold transition-colors"
          >
            Create Message Template →
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-5 py-2.5 rounded-lg border border-zinc-300 hover:border-zinc-400 text-zinc-700 text-sm font-medium transition-colors"
          >
            Skip — Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900">
          Connect Your WhatsApp Business Account
        </h1>
        <p className="mt-2 text-zinc-600">
          Choose how you&apos;d like to connect:
        </p>
      </header>

      {/* PRIMARY — Embedded Signup */}
      <div className="bg-white rounded-xl border-2 border-[#25D366] p-6 shadow-sm hover:shadow transition-shadow">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs uppercase tracking-wide font-semibold text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Recommended
          </span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-1.5">
          Connect WhatsApp Business
        </h2>
        <p className="text-sm text-zinc-600 mb-4 leading-relaxed">
          Sign in with Meta and connect your WhatsApp Business account in
          one click. Takes less than 5 minutes. No API tokens or technical
          knowledge required.
        </p>
        <EmbeddedSignup onSuccess={setConnected} />
      </div>

      <div className="flex items-center gap-3 my-2">
        <div className="h-px bg-zinc-200 flex-1" />
        <span className="text-xs uppercase tracking-wide text-zinc-400 font-medium">
          or
        </span>
        <div className="h-px bg-zinc-200 flex-1" />
      </div>

      {/* SECONDARY — Manual Setup */}
      <div className="bg-white rounded-xl border border-zinc-200 hover:border-[#25D366] p-6 shadow-sm transition-colors">
        <div className="flex items-center gap-2 mb-2 text-zinc-700">
          <Wrench className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-zinc-900">
            Manual Setup
          </h2>
        </div>
        <p className="text-sm text-zinc-600 mb-4 leading-relaxed">
          Already have Meta API credentials? Enter your API token, Phone
          Number ID, and Business Account ID directly. Best for developers
          and technical users.
        </p>
        <button
          onClick={() => router.push("/onboarding?mode=manual")}
          className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 hover:border-[#25D366] text-zinc-700 text-sm font-medium transition-colors"
        >
          Set Up Manually →
        </button>
      </div>

      {/* TERTIARY — Done-For-You */}
      <div className="bg-white rounded-xl border border-zinc-200 hover:border-[#25D366] p-6 shadow-sm transition-colors">
        <div className="flex items-center gap-2 mb-2 text-zinc-700">
          <HelpCircle className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-zinc-900">
            Done-For-You Setup
          </h2>
        </div>
        <p className="text-sm text-zinc-600 mb-4 leading-relaxed">
          We set up everything for you. You focus on your business.
          Turnaround: 1–2 business days.
        </p>
        <button
          onClick={() => setDfyOpen(true)}
          className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 hover:border-[#25D366] text-zinc-700 text-sm font-medium transition-colors"
        >
          Get Done-For-You Setup — $149 →
        </button>
      </div>

      <SetupRequestModal open={dfyOpen} onClose={() => setDfyOpen(false)} />
    </div>
  );
}
