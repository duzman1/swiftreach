"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "swiftreach.connectionBanner.dismissed";

interface Props {
  show: boolean;
}

/**
 * Dashboard banner shown when the user hasn't connected WhatsApp yet. Hides
 * itself after dismissal until the user reloads the page (sessionStorage).
 */
export function ConnectionBanner({ show }: Props) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  if (!show || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-amber-900 text-sm">
          WhatsApp not connected
        </div>
        <div className="text-xs text-amber-800 mt-0.5">
          Add your Meta API credentials in Settings before creating campaigns.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/settings">
          <Button size="sm" variant="outline" className="bg-background">
            Go to Settings →
          </Button>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-amber-700 hover:text-amber-900"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
