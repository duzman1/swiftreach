"use client";

// Token input — masked by default, with a show/hide toggle. Sends the
// raw token to PUT /api/user/settings which encrypts it server-side
// (AES-256-CBC, see lib/encrypt.ts) before persisting.

import * as React from "react";
import Image from "next/image";
import { ExternalLink, AlertCircle, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardStep } from "./WizardStep";

interface Props {
  alreadySaved?: boolean;
  onBack: () => void;
  onNext: () => void | Promise<void>;
}

function describeError(raw: string): string | null {
  if (!raw) return "Access token is required.";
  if (!raw.startsWith("EAAR")) {
    return "Access tokens start with EAAR. Double-check you copied the full token.";
  }
  if (raw.length < 50) {
    return "Access tokens are very long. Double-check you copied the whole token.";
  }
  return null;
}

export function Step5AccessToken({ alreadySaved, onBack, onNext }: Props) {
  const [token, setToken] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const error = touched ? describeError(token.trim()) : null;
  const canSubmit = !describeError(token.trim());

  async function saveAndContinue() {
    setTouched(true);
    if (!canSubmit) return;

    setSaving(true);
    try {
      const r = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappApiToken: token.trim(),
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Save failed");
      toast.success("Token saved (encrypted)");
      await onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't save token");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardStep
      stepNumber={5}
      title="Create Your Permanent Access Token"
      subtitle={
        <>
          <span className="text-amber-700 font-medium">
            ⚠️ This is the most important step.
          </span>{" "}
          The access token is the &quot;password&quot; SwiftReach uses to send
          messages on your behalf. You need a <strong>PERMANENT</strong> token,
          not a temporary one.
        </>
      }
      onBack={onBack}
      onNext={saveAndContinue}
      nextLabel="Save & Continue →"
      nextDisabled={!canSubmit && !alreadySaved}
      loading={saving}
    >
      <Image
        src="/setup/step-5-system-user.png"
        alt="Meta Business Settings → System Users → Add System User"
        width={800}
        height={450}
        className="rounded-lg border border-gray-200 w-full object-contain"
      />

      <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
        <li>
          Go to{" "}
          <a
            href="https://business.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="text-whatsapp hover:underline"
          >
            business.facebook.com
          </a>
          .
        </li>
        <li>Click the gear icon (Settings).</li>
        <li>
          Click <strong>System Users</strong> in the left menu.
        </li>
        <li>
          Click <strong>Add</strong> to create a new system user.
        </li>
        <li>
          Name it <code className="px-1 py-0.5 rounded bg-zinc-100">SwiftReach</code> and set role to <strong>Admin</strong>.
        </li>
        <li>
          Click <strong>Generate New Token</strong>.
        </li>
        <li>Select your WhatsApp app from the dropdown.</li>
        <li>
          Set token expiry to <strong>Never</strong>.
        </li>
        <li>
          Enable permissions:{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100">whatsapp_business_messaging</code> and{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100">whatsapp_business_management</code>.
        </li>
        <li>
          Click <strong>Generate Token</strong> and copy it.
        </li>
      </ol>

      <Image
        src="/setup/step-5-token-expiry.png"
        alt="Generate Token screen with Never expiry selected"
        width={800}
        height={450}
        className="rounded-lg border border-gray-200 w-full object-contain"
      />

      <div>
        <Label htmlFor="wizard-token" className="block mb-1.5">
          🔒 Your Access Token (keep this secret!)
        </Label>
        <div className="relative">
          <Input
            id="wizard-token"
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="EAAR..."
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (!touched) setTouched(true);
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(error)}
            className={`pr-10 font-mono text-xs ${
              error ? "border-red-400 focus-visible:ring-red-400" : ""
            }`}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-700"
            aria-label={reveal ? "Hide token" : "Show token"}
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Stored securely with AES-256 encryption
        </p>
        {error && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
        {alreadySaved && !token && (
          <p className="text-xs text-emerald-700 mt-1">
            ✓ A token is already saved for your account. Enter a new one to
            replace it, or click Save &amp; Continue to keep the existing one.
          </p>
        )}
      </div>

      <a
        href="https://business.facebook.com"
        target="_blank"
        rel="noreferrer"
        className="inline-block"
      >
        <Button variant="outline" className="gap-2">
          <ExternalLink className="w-4 h-4" />
          Open Meta Business Settings
        </Button>
      </a>
    </WizardStep>
  );
}
