"use client";

// Saves whatsappPhoneNumberId + whatsappBusinessAccountId via the existing
// PUT /api/user/settings endpoint. Validates digits-only and >= 10 chars
// before the save attempt so the user gets immediate feedback.

import * as React from "react";
import Image from "next/image";
import { ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardStep } from "./WizardStep";

interface Props {
  initialPhoneNumberId?: string;
  initialBusinessAccountId?: string;
  onBack: () => void;
  onNext: () => void | Promise<void>;
}

function normaliseId(raw: string): string {
  // Strip everything except digits — paste from Meta sometimes drops a
  // stray space or a leading "ID:" the user copied accidentally.
  return raw.replace(/\D/g, "");
}

function describeError(field: "phone" | "waba", value: string): string | null {
  if (!value) {
    return field === "phone"
      ? "Phone Number ID is required."
      : "Business Account ID is required.";
  }
  if (value.length < 10) {
    return "This doesn't look right — Phone Number IDs are long numbers like 709910892204819.";
  }
  return null;
}

export function Step4PhoneNumberId({
  initialPhoneNumberId = "",
  initialBusinessAccountId = "",
  onBack,
  onNext,
}: Props) {
  const [phoneNumberId, setPhoneNumberId] = React.useState(initialPhoneNumberId);
  const [businessAccountId, setBusinessAccountId] = React.useState(
    initialBusinessAccountId
  );
  const [saving, setSaving] = React.useState(false);
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [wabaTouched, setWabaTouched] = React.useState(false);

  const phoneError = phoneTouched ? describeError("phone", phoneNumberId) : null;
  const wabaError = wabaTouched ? describeError("waba", businessAccountId) : null;

  const isValid =
    !describeError("phone", phoneNumberId) &&
    !describeError("waba", businessAccountId);

  async function saveAndContinue() {
    // Re-mark touched so errors render if user clicks blindly.
    setPhoneTouched(true);
    setWabaTouched(true);
    if (!isValid) return;

    setSaving(true);
    try {
      const r = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappPhoneNumberId: phoneNumberId,
          whatsappBusinessAccountId: businessAccountId,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Save failed");
      toast.success("IDs saved");
      await onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't save IDs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardStep
      stepNumber={4}
      title="Find Your Phone Number ID"
      subtitle="Now we need two numbers from your Meta app. Don't worry — we'll show you exactly where to find them."
      onBack={onBack}
      onNext={saveAndContinue}
      nextLabel="Save & Continue →"
      nextDisabled={!isValid}
      loading={saving}
    >
      <Image
        src="/setup/step-4-phone-number-id.png"
        alt="WhatsApp Getting Started page with Phone Number ID and Business Account ID circled"
        width={800}
        height={450}
        className="rounded-lg border border-gray-200 w-full object-contain"
      />

      <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
        <li>
          In your Meta app, click <strong>WhatsApp</strong> in the left sidebar.
        </li>
        <li>
          Click <strong>Getting Started</strong>.
        </li>
        <li>
          You&apos;ll see two IDs on this page:
          <ul className="list-disc pl-6 mt-1 space-y-1 text-zinc-600">
            <li>Phone Number ID (a long number)</li>
            <li>WhatsApp Business Account ID</li>
          </ul>
        </li>
        <li>Copy and paste both below.</li>
      </ol>

      <div className="space-y-4">
        <div>
          <Label htmlFor="wizard-phone-id" className="block mb-1.5">
            Phone Number ID
          </Label>
          <Input
            id="wizard-phone-id"
            inputMode="numeric"
            autoComplete="off"
            placeholder="709910892204819"
            value={phoneNumberId}
            onChange={(e) => {
              setPhoneNumberId(normaliseId(e.target.value));
              if (!phoneTouched) setPhoneTouched(true);
            }}
            onBlur={() => setPhoneTouched(true)}
            aria-invalid={Boolean(phoneError)}
            className={phoneError ? "border-red-400 focus-visible:ring-red-400" : ""}
          />
          <p className="text-xs text-zinc-500 mt-1">looks like: 709910892204819</p>
          {phoneError && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {phoneError}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="wizard-waba-id" className="block mb-1.5">
            Business Account ID
          </Label>
          <Input
            id="wizard-waba-id"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1310871837707829"
            value={businessAccountId}
            onChange={(e) => {
              setBusinessAccountId(normaliseId(e.target.value));
              if (!wabaTouched) setWabaTouched(true);
            }}
            onBlur={() => setWabaTouched(true)}
            aria-invalid={Boolean(wabaError)}
            className={wabaError ? "border-red-400 focus-visible:ring-red-400" : ""}
          />
          <p className="text-xs text-zinc-500 mt-1">looks like: 1310871837707829</p>
          {wabaError && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {wabaError}
            </p>
          )}
        </div>
      </div>

      <a
        href="https://developers.facebook.com"
        target="_blank"
        rel="noreferrer"
        className="inline-block"
      >
        <Button variant="outline" className="gap-2">
          <ExternalLink className="w-4 h-4" />
          Open Meta for Developers
        </Button>
      </a>
    </WizardStep>
  );
}
