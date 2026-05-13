"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardStep } from "./WizardStep";
import { ScreenshotPlaceholder } from "./ScreenshotPlaceholder";

interface Props {
  onBack: () => void;
  onNext: () => void | Promise<void>;
}

export function Step2MetaAccount({ onBack, onNext }: Props) {
  return (
    <WizardStep
      stepNumber={2}
      title="Create Your Meta Developer Account"
      subtitle="Meta (the company that owns WhatsApp) requires a free developer account to use the WhatsApp Business API."
      onBack={onBack}
      onNext={onNext}
      nextLabel="I've Done This — Next →"
    >
      <ScreenshotPlaceholder
        src="step-2-meta-developer.png"
        description="Meta for Developers homepage with the Get Started button highlighted"
      />

      <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
        <li>Click the button below to open Meta for Developers in a new tab.</li>
        <li>
          Click <strong>Get Started</strong> in the top right.
        </li>
        <li>
          Log in with your Facebook account (or create one — it&apos;s free).
        </li>
        <li>Accept the developer terms.</li>
        <li>
          Come back here and click <strong>I&apos;ve done this</strong>.
        </li>
      </ol>

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

      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-md px-3 py-2 border border-zinc-200">
        ✓ Already have a Meta developer account? No problem — just click
        continue below.
      </div>
    </WizardStep>
  );
}
