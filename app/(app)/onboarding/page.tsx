// Phase 8: the onboarding URL now defaults to a three-card CHOOSER
// (Embedded Signup / Manual / Done-For-You). The manual 7-step wizard
// from Phase 7 is still accessible via `?mode=manual` for any user
// who prefers it, or as a fallback when Embedded Signup isn't yet
// approved in Meta.

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { WizardClient } from "./WizardClient";
import { ConnectChooser } from "./ConnectChooser";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { redo?: string; mode?: string };
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const user = await requireUser();

  const mode = searchParams?.mode;
  const redo = searchParams?.redo === "1";

  // Completed users bounce unless they explicitly asked to redo.
  if (user.wizardCompletedAt && !redo && mode !== "manual") {
    redirect("/dashboard");
  }

  // Manual mode → render the existing 7-step wizard exactly as in
  // Phase 7. The chooser sends users here when they click "Set Up
  // Manually" or "Set up manually instead" (link inside the embedded
  // signup component).
  if (mode === "manual") {
    return (
      <div className="max-w-3xl mx-auto py-6 md:py-10 space-y-6">
        <WizardClient
          userId={user.id}
          initial={{
            step: user.wizardStep ?? 1,
            phoneNumberId: user.whatsappPhoneNumberId ?? "",
            businessAccountId: user.whatsappBusinessAccountId ?? "",
            hasApiToken: Boolean(user.whatsappApiToken),
          }}
        />
      </div>
    );
  }

  // Default: the new chooser screen.
  return (
    <div className="max-w-3xl mx-auto py-6 md:py-10">
      <ConnectChooser />
    </div>
  );
}
