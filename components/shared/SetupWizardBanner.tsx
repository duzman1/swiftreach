"use client";

// Dashboard banner shown when the user hasn't started OR completed the
// guided setup wizard AND has no Meta token saved. Replaces the generic
// "WhatsApp not connected" banner in that state — gives the user a
// clear, single-click path into the wizard plus the done-for-you option.

import * as React from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupRequestModal } from "@/components/wizard/SetupRequestModal";

export function SetupWizardBanner() {
  const [modalOpen, setModalOpen] = React.useState(false);
  return (
    <>
      <div className="rounded-lg border border-whatsapp/40 bg-emerald-50 p-5 flex items-start gap-4">
        <div className="bg-whatsapp/10 text-whatsapp rounded-md p-2 shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-emerald-900">
            🚀 Complete your setup to start sending messages
          </div>
          <p className="text-sm text-emerald-800/80 mt-1">
            You&apos;re 7 steps away from sending your first WhatsApp campaign.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Link href="/onboarding">
              <Button className="bg-whatsapp hover:bg-whatsapp-dark text-white gap-1.5">
                Start Setup Wizard →
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => setModalOpen(true)}
              className="bg-white"
            >
              Get Help — $149 →
            </Button>
          </div>
        </div>
      </div>
      <SetupRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
