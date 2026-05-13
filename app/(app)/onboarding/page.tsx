// Phase 7 wizard entry point. Replaces the previous one-page
// OnboardingForm with a 7-step guided setup. The container is a
// server component that loads the user's saved progress + saved
// credentials, then hands off to the client-side <WizardClient />
// which manages the step-by-step UI.
//
// Already-completed users (wizardCompletedAt set) bounce to the
// dashboard so the wizard isn't re-runnable by accident. They can
// still reach it manually from /settings/setup, which deliberately
// does NOT enforce this redirect — see app/(app)/settings/page.tsx.

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { WizardClient } from "./WizardClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { redo?: string };
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const user = await requireUser();

  // Already completed? Bounce — unless they explicitly asked to redo
  // setup via ?redo=1 (the Settings page uses that query string).
  if (user.wizardCompletedAt && searchParams?.redo !== "1") {
    redirect("/dashboard");
  }

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
