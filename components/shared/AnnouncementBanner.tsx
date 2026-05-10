"use client";

// Renders the currently-active announcement above page content. Each
// announcement gets its own dismissal key in localStorage so dismissing one
// doesn't permanently silence future banners.

import { useEffect, useState } from "react";
import { Info, AlertTriangle, CheckCircle2, X } from "lucide-react";

interface ActiveAnnouncement {
  id: string;
  message: string;
  type: string;
  target: string;
  createdAt: string;
}

const PALETTE: Record<
  string,
  { bg: string; border: string; text: string; icon: typeof Info }
> = {
  info: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-900",
    icon: Info,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    icon: AlertTriangle,
  },
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-900",
    icon: CheckCircle2,
  },
};

function dismissKey(id: string): string {
  return `swiftreach.dismissed.announcement.${id}`;
}

export function AnnouncementBanner() {
  const [ann, setAnn] = useState<ActiveAnnouncement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/active")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok || !j.announcement) return;
        const a: ActiveAnnouncement = j.announcement;
        if (typeof window !== "undefined" && localStorage.getItem(dismissKey(a.id))) {
          setDismissed(true);
        }
        setAnn(a);
      })
      .catch(() => {
        // Silent — banner is best-effort.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ann || dismissed) return null;

  const palette = PALETTE[ann.type] ?? PALETTE.info;
  const Icon = palette.icon;

  return (
    <div
      className={`mb-6 rounded-md border ${palette.bg} ${palette.border} ${palette.text} px-4 py-3 flex items-start gap-3`}
      role="status"
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm whitespace-pre-wrap">{ann.message}</div>
      <button
        onClick={() => {
          if (typeof window !== "undefined") {
            localStorage.setItem(dismissKey(ann.id), "1");
          }
          setDismissed(true);
        }}
        className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
