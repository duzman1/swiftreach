"use client";

// Two-phase step:
//   Phase A: Test Connection. Calls /api/settings/test-connection with
//     an empty body so it uses the user's saved creds. Translates the
//     raw Meta error (token expired, wrong phone number id, rate limit)
//     into plain English with a back-to-step-N hint.
//   Phase B: Webhook config. Generates a verify token if needed,
//     surfaces the webhook URL (per-user, /api/webhook/[userId]), and
//     gates "Continue" on a checkbox so the user has to acknowledge
//     they've configured Meta.

import * as React from "react";
import Image from "next/image";
import {
  ExternalLink,
  Check,
  Copy,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WizardStep } from "./WizardStep";

interface Props {
  userId: string;
  onBack: () => void;
  onNext: () => void | Promise<void>;
}

type TestState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "ok"; verifiedName?: string; displayPhone?: string }
  | { phase: "fail"; message: string; hint?: string };

// Translate Meta error codes / shapes to copy that doesn't assume the
// user has any technical context.
function translateError(input: {
  message?: string;
  code?: string | number;
  httpStatus?: number;
}): { message: string; hint?: string } {
  const code = String(input.code ?? "");
  const status = input.httpStatus ?? 0;
  const raw = input.message ?? "Unknown error";

  // Rate limit
  if (code === "4" || code === "80004" || status === 429) {
    return {
      message: "Too many attempts. Wait 1 minute and try again.",
    };
  }
  // Invalid / expired token
  if (
    code === "190" ||
    code === "104" ||
    /invalid/i.test(raw) ||
    /expired/i.test(raw) ||
    status === 401
  ) {
    return {
      message: "Your access token is incorrect or expired.",
      hint: "Go back to Step 5 and generate a new permanent token.",
    };
  }
  // Phone number id / account mismatch
  if (
    code === "100" ||
    code === "33" ||
    /phone/i.test(raw) ||
    /not.*found/i.test(raw)
  ) {
    return {
      message: "The Phone Number ID doesn't match your access token.",
      hint: "Double-check Step 4 — both IDs need to come from the same Meta app.",
    };
  }
  // Permission-ish issues
  if (status === 403 || /permission/i.test(raw)) {
    return {
      message: "Your token doesn't have permission to send WhatsApp messages.",
      hint: "In Step 5, make sure both whatsapp_business_messaging and whatsapp_business_management are enabled on the token.",
    };
  }
  return {
    message: raw,
    hint: "If this keeps happening, click \"Get Help\" on the welcome screen — we'll do the setup for you.",
  };
}

export function Step6TestConnection({ userId, onBack, onNext }: Props) {
  const [test, setTest] = React.useState<TestState>({ phase: "idle" });
  const [verifyToken, setVerifyToken] = React.useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.swiftreach.app";
  const webhookUrl = `${baseUrl}/api/webhook/${userId}`;

  // Mint / fetch the verify token on mount so it's ready to copy. The
  // route is idempotent — if the user already has one it's returned.
  React.useEffect(() => {
    let cancelled = false;
    setVerifyLoading(true);
    fetch("/api/wizard/verify-token", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok) setVerifyToken(j.webhookVerifyToken);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setVerifyLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function runTest() {
    setTest({ phase: "running" });
    try {
      const r = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json();
      if (j.ok) {
        setTest({
          phase: "ok",
          verifiedName: j.verifiedName,
          displayPhone: j.displayPhoneNumber,
        });
      } else {
        const t = translateError(j);
        setTest({ phase: "fail", ...t });
      }
    } catch (err: unknown) {
      setTest({
        phase: "fail",
        message:
          err instanceof Error ? err.message : "Network error testing connection",
      });
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — try selecting and pressing Ctrl/Cmd+C.");
    }
  }

  return (
    <WizardStep
      stepNumber={6}
      title="Test Your Connection"
      subtitle="Let's make sure everything is connected correctly before we continue."
      onBack={onBack}
      onNext={onNext}
      nextLabel="Continue →"
      nextDisabled={!confirmed}
    >
      {/* ── Test connection block ─────────────────────────────────── */}
      <div className="space-y-3">
        <Button
          onClick={runTest}
          disabled={test.phase === "running"}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white gap-2"
        >
          {test.phase === "running" && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          Test My Connection
        </Button>

        {test.phase === "ok" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-emerald-900">
                ✅ Connected!
              </div>
              <div className="text-xs text-emerald-800/80 mt-0.5">
                Your WhatsApp Business account is connected and ready to send
                messages.
                {test.verifiedName && (
                  <> Account: <strong>{test.verifiedName}</strong></>
                )}
                {test.displayPhone && <> ({test.displayPhone})</>}.
              </div>
            </div>
          </div>
        )}

        {test.phase === "fail" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-900">
                ❌ Connection failed
              </div>
              <div className="text-xs text-red-800/80 mt-0.5">
                {test.message}
              </div>
              {test.hint && (
                <div className="text-xs text-red-800/80 mt-2">
                  <strong>What to do:</strong> {test.hint}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 -mx-6 md:-mx-8 px-6 md:px-8 py-5 -mb-5 bg-zinc-50/50">
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">
          One more thing — add this URL to Meta so SwiftReach can track message
          delivery:
        </h3>

        {/* Webhook URL */}
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
            Your Webhook URL
          </label>
          <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-md px-3 py-2">
            <code className="flex-1 text-xs font-mono text-zinc-700 break-all">
              {webhookUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copy(webhookUrl, "Webhook URL")}
              className="shrink-0 gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </Button>
          </div>
        </div>

        {/* Verify token */}
        <div className="space-y-1.5 mt-3">
          <label className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
            Your Verify Token
          </label>
          <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-md px-3 py-2">
            {verifyLoading || !verifyToken ? (
              <code className="flex-1 text-xs font-mono text-zinc-400">
                Generating…
              </code>
            ) : (
              <code className="flex-1 text-xs font-mono text-zinc-700 break-all">
                {verifyToken}
              </code>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => verifyToken && copy(verifyToken, "Verify token")}
              disabled={!verifyToken}
              className="shrink-0 gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </Button>
          </div>
        </div>

        <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700 mt-5">
          <li>
            In Meta for Developers, click <strong>WhatsApp</strong>.
          </li>
          <li>
            Click <strong>Configuration</strong>.
          </li>
          <li>
            Under <strong>Webhook</strong>, click <strong>Edit</strong>.
          </li>
          <li>Paste your Webhook URL above.</li>
          <li>Paste your Verify Token above.</li>
          <li>
            Click <strong>Verify and Save</strong>.
          </li>
          <li>
            Subscribe to: <code className="px-1 py-0.5 rounded bg-zinc-100">messages</code> and{" "}
            <code className="px-1 py-0.5 rounded bg-zinc-100">message_status</code>.
          </li>
        </ol>

        <div className="mt-4">
          <Image
            src="/setup/step-6-webhook.png"
            alt="Webhook configuration page on Meta for Developers"
            width={800}
            height={450}
            className="rounded-lg border border-gray-200 w-full object-contain"
          />
        </div>

        <a
          href="https://developers.facebook.com"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-4"
        >
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Open Meta for Developers
          </Button>
        </a>

        <label className="flex items-start gap-2 mt-5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>I&apos;ve added the webhook to Meta</span>
        </label>
        {!confirmed && (
          <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Check the box above once you&apos;ve verified the webhook in Meta.
          </p>
        )}
      </div>
    </WizardStep>
  );
}
