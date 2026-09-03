"use client";

// Dashboard banner surfacing recent warning + critical campaign
// alerts. Fetches from /api/alerts on mount, hides itself when
// there are none. Clicking "Dismiss" marks all currently-shown
// alerts as read (via PUT /api/alerts) and hides the banner.
//
// Renders nothing until the fetch completes to avoid a layout
// flash for users with no alerts.

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface UnreadAlert {
  id: string;
  title: string;
  type: string;
  campaign: { id: string; name: string } | null;
}

interface Response {
  ok: boolean;
  alerts: UnreadAlert[];
  totalUnread: number;
}

export function UnreadAlertsBanner() {
  const [alerts, setAlerts] = React.useState<UnreadAlert[] | null>(null);
  const [totalUnread, setTotalUnread] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts")
      .then((r) => r.json() as Promise<Response>)
      .then((data) => {
        if (cancelled || !data.ok) return;
        setAlerts(data.alerts);
        setTotalUnread(data.totalUnread);
      })
      .catch(() => {
        // Silent — dashboard banner is best-effort. Failing to load
        // shouldn't prevent the rest of the dashboard from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDismiss() {
    if (!alerts || alerts.length === 0) return;
    setDismissed(true);
    try {
      await fetch("/api/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds: alerts.map((a) => a.id) }),
      });
    } catch {
      // Best-effort dismissal. If the PUT fails the banner reappears
      // on next dashboard load — acceptable.
    }
  }

  if (dismissed || !alerts || alerts.length === 0) return null;

  const singular = totalUnread === 1;
  const firstCritical = alerts.find((a) => a.type === "critical");
  const firstAlert = firstCritical ?? alerts[0];

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">
            {totalUnread} campaign insight{singular ? "" : "s"} need
            {singular ? "s" : ""} your attention
          </p>
          <p className="text-sm text-amber-800 mt-0.5 truncate">
            {firstAlert.campaign
              ? `${firstAlert.campaign.name}: ${firstAlert.title}`
              : firstAlert.title}
            {totalUnread > 1 && (
              <span className="text-amber-700"> · +{totalUnread - 1} more</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDismiss}
          className="text-sm text-amber-700 hover:text-amber-900 px-3 py-2 rounded-md hover:bg-amber-100"
        >
          Dismiss
        </button>
        {firstAlert.campaign ? (
          <Link
            href={`/campaigns/${firstAlert.campaign.id}`}
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            Review →
          </Link>
        ) : (
          <Link
            href="/campaigns"
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            View campaigns →
          </Link>
        )}
      </div>
    </div>
  );
}
