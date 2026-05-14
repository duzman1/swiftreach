"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardStep } from "./WizardStep";

interface Props {
  onBack: () => void;
  onNext: () => void | Promise<void>;
}

export function Step3CreateApp({ onBack, onNext }: Props) {
  return (
    <WizardStep
      stepNumber={3}
      title="Create Your WhatsApp Business App"
      subtitle="Now we'll create an 'App' inside Meta that connects your WhatsApp number to SwiftReach."
      onBack={onBack}
      onNext={onNext}
      nextLabel="I've Done This — Next →"
    >
      <Image
        src="/setup/step-3-create-app.png"
        alt="Meta dashboard with the Create App button highlighted"
        width={800}
        height={450}
        className="rounded-lg border border-gray-200 w-full object-contain"
      />

      <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
        <li>
          In Meta for Developers, click <strong>My Apps</strong> in the top
          navigation.
        </li>
        <li>
          Click <strong>Create App</strong>.
        </li>
        <li>
          Select <strong>Business</strong> as the app type.
        </li>
        <li>
          Enter your app name: <code className="px-1 py-0.5 rounded bg-zinc-100">SwiftReach</code> or your business name.
        </li>
        <li>Enter your business email.</li>
        <li>
          Click <strong>Create App</strong>.
        </li>
        <li>
          On the next screen, find <strong>WhatsApp</strong> and click{" "}
          <strong>Set Up</strong>.
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
    </WizardStep>
  );
}
