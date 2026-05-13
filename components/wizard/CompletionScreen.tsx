"use client";

// "🎉 You're all set!" celebration shown after the user completes Step 7.
// Self-redirects to /dashboard after a short pause so the user reads it.

import * as React from "react";
import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";

interface Props {
  redirectMs?: number;
  redirectTo?: string;
}

export function CompletionScreen({
  redirectMs = 2500,
  redirectTo = "/dashboard",
}: Props) {
  const router = useRouter();

  React.useEffect(() => {
    const t = setTimeout(() => router.push(redirectTo), redirectMs);
    return () => clearTimeout(t);
  }, [router, redirectMs, redirectTo]);

  return (
    <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-10 md:p-16 text-center space-y-4">
      <div className="w-20 h-20 mx-auto rounded-full bg-whatsapp/10 flex items-center justify-center">
        <PartyPopper className="w-10 h-10 text-whatsapp" />
      </div>
      <h2 className="text-3xl md:text-4xl font-bold text-zinc-900">
        🎉 You&apos;re all set!
      </h2>
      <p className="max-w-md mx-auto text-zinc-600 leading-relaxed">
        SwiftReach is connected to your WhatsApp Business account.
      </p>
      <p className="max-w-md mx-auto text-sm text-zinc-500">
        Once your template is approved (24–48 hrs), you can send your first
        campaign!
      </p>
      <p className="text-xs text-zinc-400 mt-6">Redirecting to dashboard…</p>
    </div>
  );
}
