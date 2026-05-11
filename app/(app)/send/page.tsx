import { Suspense } from "react";
import { WizardSend } from "@/components/send/WizardSend";

export default function NewCampaignPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">New Campaign</h1>
        <p className="text-muted-foreground mt-1">
          Upload your customer list, compose a personalized campaign, and reach opted-in customers on WhatsApp.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <WizardSend />
      </Suspense>
    </div>
  );
}
