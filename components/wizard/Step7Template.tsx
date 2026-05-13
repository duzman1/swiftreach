"use client";

// Final step. Doesn't actually submit anything to Meta — Meta template
// submission is manual on their side and takes 24-48h, so we just guide
// the user through it. The "Go to Dashboard" button advances the wizard
// to step 7+ (which stamps wizardCompletedAt) and the parent swaps to
// the celebration screen.

import * as React from "react";
import { ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardStep } from "./WizardStep";
import { ScreenshotPlaceholder } from "./ScreenshotPlaceholder";

interface Props {
  onBack: () => void;
  onFinish: () => void | Promise<void>;
  loading?: boolean;
}

const SUGGESTED_NAME = "greeting_message";
const SUGGESTED_BODY =
  "Hello {{1}}, this is a message from [Your Business Name]. {{2}}";

export function Step7Template({ onBack, onFinish, loading }: Props) {
  const [name, setName] = React.useState(SUGGESTED_NAME);
  const [body, setBody] = React.useState(SUGGESTED_BODY);
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <WizardStep
      stepNumber={7}
      title="Almost Done! Create Your First Message Template"
      subtitle="WhatsApp requires all outbound messages to use pre-approved templates. This takes 24–48 hours for Meta to review. We'll help you create a simple template now so you're ready to send as soon as it's approved."
      onBack={onBack}
      onNext={onFinish}
      nextLabel="Go to Dashboard — I'm Ready! →"
      loading={loading}
    >
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
          Template Creator
        </div>

        <div>
          <Label htmlFor="tpl-name" className="block mb-1.5">
            Template name (no spaces, use underscores)
          </Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) =>
              setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
            }
            placeholder="greeting_message"
            className="font-mono text-sm"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Suggestion: <code className="px-1 py-0.5 rounded bg-zinc-100">greeting_message</code>
          </p>
        </div>

        <div>
          <Label htmlFor="tpl-body" className="block mb-1.5">
            Template message
          </Label>
          <textarea
            id="tpl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">
            <code className="px-1 py-0.5 rounded bg-zinc-100">{`{{1}}`}</code> = Contact&apos;s name (from your list).{" "}
            <code className="px-1 py-0.5 rounded bg-zinc-100">{`{{2}}`}</code> = Custom message (same for all contacts).
          </p>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold text-zinc-900 mb-2">
          How to submit this template to Meta
        </div>
        <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
          <li>
            In Meta for Developers → <strong>WhatsApp</strong>.
          </li>
          <li>
            Click <strong>Message Templates</strong>.
          </li>
          <li>
            Click <strong>Create Template</strong>.
          </li>
          <li>
            Category: <strong>Utility</strong>.
          </li>
          <li>Name: paste the name above.</li>
          <li>Language: English.</li>
          <li>Body: paste the message above.</li>
          <li>
            Click <strong>Submit</strong>.
          </li>
          <li>Wait 24–48 hours for approval.</li>
        </ol>
      </div>

      <ScreenshotPlaceholder
        src="step-7-templates.png"
        description="Message Templates page on Meta for Developers"
      />

      <a
        href="https://developers.facebook.com"
        target="_blank"
        rel="noreferrer"
        className="inline-block"
      >
        <Button variant="outline" className="gap-2">
          <ExternalLink className="w-4 h-4" />
          Open Meta Message Templates
        </Button>
      </a>

      <label className="flex items-start gap-2 text-sm cursor-pointer pt-2">
        <input
          type="checkbox"
          checked={submitted}
          onChange={(e) => setSubmitted(e.target.checked)}
          className="mt-1"
        />
        <span>I&apos;ve submitted my template (or I&apos;ll do it later)</span>
      </label>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-2">
          What happens while you wait
        </div>
        <ul className="space-y-1.5 text-sm text-emerald-900">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            Upload your contact list.
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            Build your message in SwiftReach.
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            Set up your campaign — ready to send on approval!
          </li>
        </ul>
      </div>
    </WizardStep>
  );
}
