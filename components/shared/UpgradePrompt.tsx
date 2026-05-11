// Locked-state UI for paid features when a free-plan user lands on the
// page. Used by /inbox, /analytics, /contacts, /scheduled.
//
// Don't disguise this as the real feature — make it obvious the user is
// looking at a paywall, with a clear path to upgrade.

import Link from "next/link";
import { Lock, Check, Sparkles } from "lucide-react";

const ALL_FEATURES = [
  "Scheduled & recurring campaigns",
  "Permanent contact book with groups",
  "Analytics dashboard (delivery + read rates, best send times)",
  "Two-way messaging inbox (replies + STOP detection)",
];

interface Props {
  /** Headline noun — "Analytics", "Inbox", "Contact Book", etc. */
  feature: string;
  /** Optional one-line lead under the headline. */
  description?: string;
}

export function UpgradePrompt({ feature, description }: Props) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 px-6 py-10 text-center border-b">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-sm mb-4">
            <Lock className="w-6 h-6 text-emerald-700" />
          </div>
          <h2 className="text-2xl font-semibold text-zinc-900">
            {feature} is a paid feature
          </h2>
          {description && (
            <p className="text-sm text-zinc-600 mt-2 max-w-md mx-auto">
              {description}
            </p>
          )}
        </div>
        <div className="p-6 space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Upgrade to unlock
            </div>
            <ul className="space-y-2">
              {ALL_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-zinc-700">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
            <Link
              href="/billing"
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors"
            >
              Upgrade to Starter — $29/mo →
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center justify-center px-4 py-2.5 border border-zinc-200 text-sm font-medium rounded-md hover:bg-zinc-50 transition-colors"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
