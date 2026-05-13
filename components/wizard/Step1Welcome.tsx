"use client";

import * as React from "react";
import { Check, HelpCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardStep } from "./WizardStep";
import { SetupRequestModal } from "./SetupRequestModal";

interface Props {
  onNext: () => void | Promise<void>;
}

export function Step1Welcome({ onNext }: Props) {
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <>
      <WizardStep
        stepNumber={1}
        title="Welcome to SwiftReach 👋"
        subtitle="Before you can send your first WhatsApp campaign, we need to connect your WhatsApp Business account. This takes about 30–45 minutes. We'll guide you through every step."
        onNext={onNext}
        nextLabel="I'll Do It Myself →"
        hideBack
      >
        <div className="bg-zinc-50 rounded-lg p-5 space-y-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
            What you&apos;ll need
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-whatsapp mt-0.5 shrink-0" />
              A Facebook / Meta account (free).
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-whatsapp mt-0.5 shrink-0" />
              A phone number for WhatsApp Business — your existing business
              number is fine.
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-whatsapp mt-0.5 shrink-0" />
              About 30–45 minutes.
            </li>
          </ul>
        </div>

        <div className="bg-zinc-50 rounded-lg p-5 flex items-center gap-3">
          <PlayCircle className="w-8 h-8 text-whatsapp shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-medium text-zinc-900">
              Watch: 2-minute overview
            </div>
            <div className="text-xs text-zinc-500">
              A short walkthrough of what the next 7 steps look like.
            </div>
          </div>
          <Button variant="outline" size="sm" disabled className="text-xs">
            Coming soon
          </Button>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">
              Need help? We offer done-for-you setup for $149.
            </div>
            <p className="text-xs text-amber-800/80 mt-1">
              We&apos;ll set up your Meta account, WhatsApp app, phone number,
              and first template — you just give us temporary Meta access.
            </p>
            <Button
              onClick={() => setModalOpen(true)}
              variant="outline"
              size="sm"
              className="mt-3 bg-white"
            >
              Get Help Setting Up →
            </Button>
          </div>
        </div>
      </WizardStep>

      <SetupRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
