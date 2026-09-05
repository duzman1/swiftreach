// Wrapper page for the "Create Automation" wizard. All the state
// + interactivity lives in the client component below.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAutomationCapacity } from "@/lib/automationLimits";
import { AutomationWizard } from "@/components/automations/AutomationWizard";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage() {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) redirect("/onboarding");

  const capacity = await getAutomationCapacity(user.id, user.plan);

  if (!capacity.canCreate) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link
          href="/automations"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Automations
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-semibold text-amber-900">
            {capacity.limit === 0
              ? "Automations require a paid plan"
              : `You've reached your automation limit`}
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            {capacity.limit === 0
              ? "Upgrade to Starter or Growth to enable birthday and anniversary automations."
              : `Your ${capacity.plan} plan allows up to ${capacity.limit} active automation${capacity.limit === 1 ? "" : "s"}. Archive an existing one or upgrade your plan to add more.`}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/billing"
              className="inline-flex items-center px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              View plans
            </Link>
            <Link
              href="/automations"
              className="inline-flex items-center px-4 py-2 rounded-md border border-amber-300 text-amber-800 text-sm font-medium hover:bg-amber-100"
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/automations"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Automations
      </Link>
      <AutomationWizard />
    </div>
  );
}
