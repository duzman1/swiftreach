"use client";

// Stateful wrapper that picks which step to render and persists progress.
// The 7 individual step components are dumb — they only know their own
// inputs + which buttons to expose. This file owns the flow:
//   - which step is currently visible
//   - calling PUT /api/wizard/progress when the user advances
//   - showing the celebration screen + redirect after Step 7

import * as React from "react";
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { Step1Welcome } from "@/components/wizard/Step1Welcome";
import { Step2MetaAccount } from "@/components/wizard/Step2MetaAccount";
import { Step3CreateApp } from "@/components/wizard/Step3CreateApp";
import { Step4PhoneNumberId } from "@/components/wizard/Step4PhoneNumberId";
import { Step5AccessToken } from "@/components/wizard/Step5AccessToken";
import { Step6TestConnection } from "@/components/wizard/Step6TestConnection";
import { Step7Template } from "@/components/wizard/Step7Template";
import { CompletionScreen } from "@/components/wizard/CompletionScreen";

const TOTAL_STEPS = 7;

interface Props {
  userId: string;
  initial: {
    step: number;
    phoneNumberId: string;
    businessAccountId: string;
    hasApiToken: boolean;
  };
}

export function WizardClient({ userId, initial }: Props) {
  // currentStep is local-only — the DB only ever advances, so the user
  // can navigate back in the UI without losing their high-water mark.
  const [currentStep, setCurrentStep] = React.useState<number>(
    Math.min(Math.max(initial.step, 1), TOTAL_STEPS)
  );
  const [furthestStep, setFurthestStep] = React.useState<number>(initial.step);
  const [advancing, setAdvancing] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);

  // Push the new step to the DB. Forward-only — the API ignores backwards
  // moves. Fire-and-forget on the response: if it fails the user's UI
  // still advances locally; their next page load will just resume from a
  // slightly earlier step. Not worth blocking the UI for.
  async function persist(step: number) {
    try {
      await fetch("/api/wizard/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
    } catch {
      // Silent — DB will catch up next time.
    }
  }

  async function goTo(step: number) {
    const clamped = Math.min(Math.max(step, 1), TOTAL_STEPS);
    setCurrentStep(clamped);
    if (clamped > furthestStep) {
      setFurthestStep(clamped);
      await persist(clamped);
    }
  }

  async function next() {
    setAdvancing(true);
    try {
      await goTo(currentStep + 1);
    } finally {
      setAdvancing(false);
    }
  }

  async function back() {
    // UI-only back nav — DB doesn't regress.
    setCurrentStep((s) => Math.max(1, s - 1));
  }

  async function finishWizard() {
    setAdvancing(true);
    try {
      // PUT step >= 7 stamps wizardCompletedAt + onboardingCompletedAt.
      await fetch("/api/wizard/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: TOTAL_STEPS }),
      });
      setCompleted(true);
    } finally {
      setAdvancing(false);
    }
  }

  // After Step 7 finishes, swap to the celebration screen which
  // self-redirects to /dashboard.
  if (completed) return <CompletionScreen />;

  return (
    <>
      <WizardProgress
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        furthestStep={furthestStep}
      />

      {currentStep === 1 && <Step1Welcome onNext={next} />}
      {currentStep === 2 && <Step2MetaAccount onBack={back} onNext={next} />}
      {currentStep === 3 && <Step3CreateApp onBack={back} onNext={next} />}
      {currentStep === 4 && (
        <Step4PhoneNumberId
          initialPhoneNumberId={initial.phoneNumberId}
          initialBusinessAccountId={initial.businessAccountId}
          onBack={back}
          onNext={next}
        />
      )}
      {currentStep === 5 && (
        <Step5AccessToken
          alreadySaved={initial.hasApiToken}
          onBack={back}
          onNext={next}
        />
      )}
      {currentStep === 6 && (
        <Step6TestConnection userId={userId} onBack={back} onNext={next} />
      )}
      {currentStep === 7 && (
        <Step7Template
          onBack={back}
          onFinish={finishWizard}
          loading={advancing}
        />
      )}
    </>
  );
}
