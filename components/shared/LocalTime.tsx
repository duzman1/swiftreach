"use client";

import { useEffect, useState } from "react";

// Render a Date in the viewer's own timezone. Server components can't
// do this — toLocaleString() on Vercel runs in UTC — so we accept an
// ISO string from the server and format it after hydration.
//
// First paint shows the UTC value to avoid hydration mismatch
// warnings; the useEffect swap-in happens on the first client tick,
// which is visually indistinguishable from an immediate render.

type Mode = "datetime" | "date" | "time";

export function LocalTime({
  value,
  mode = "datetime",
  options,
  fallback = "—",
}: {
  value: string | Date | null | undefined;
  mode?: Mode;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const iso =
    value === null || value === undefined
      ? null
      : value instanceof Date
        ? value.toISOString()
        : value;

  const [text, setText] = useState<string>(() => (iso ? formatWith(iso, mode, options, true) : fallback));

  useEffect(() => {
    if (!iso) return;
    setText(formatWith(iso, mode, options, false));
  }, [iso, mode, options]);

  if (!iso) return <>{fallback}</>;
  return <>{text}</>;
}

function formatWith(
  iso: string,
  mode: Mode,
  options: Intl.DateTimeFormatOptions | undefined,
  utc: boolean
): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    ...(options ?? {}),
    ...(utc ? { timeZone: "UTC" } : {}),
  };
  const hasOpts = Object.keys(opts).length > 0;
  if (mode === "time") return hasOpts ? d.toLocaleTimeString(undefined, opts) : d.toLocaleTimeString();
  if (mode === "date") return hasOpts ? d.toLocaleDateString(undefined, opts) : d.toLocaleDateString();
  return hasOpts ? d.toLocaleString(undefined, opts) : d.toLocaleString();
}
