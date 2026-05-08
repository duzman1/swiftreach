// Two-step onboarding shown immediately after sign-up. The user pastes
// their Meta credentials, tests them against the live API, then sets a few
// defaults. They can also skip — Settings will show a "WhatsApp not
// connected" banner until creds are filled in.

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-8 text-zinc-700 hover:text-foreground"
        >
          <div className="bg-whatsapp rounded-lg p-2">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">SwiftReach</span>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to SwiftReach!
          </h1>
          <p className="text-muted-foreground mt-2">
            Let&apos;s get you set up. This takes about 2 minutes.
          </p>
        </div>

        <OnboardingForm />
      </div>
    </div>
  );
}
