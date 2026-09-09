"use client";

// Wizard's fourth import option: pick a Saved Audience. Synthesises
// a ParsedFile from the live-resolved contacts (capped at 500 for the
// review table). The actual send passes audienceId to the server and
// re-resolves at send time, so a large audience still delivers to the
// full set — the cap only bounds what the wizard shows.

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParsedFile, Row } from "@/lib/parseFile";

interface AudienceRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number | null;
  rulesError: string | null;
}

interface Props {
  onParsed: (file: ParsedFile) => void;
  onCancel: () => void;
}

export function AudiencePicker({ onParsed, onCancel }: Props) {
  const [audiences, setAudiences] = React.useState<AudienceRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [locked, setLocked] = React.useState(false);
  const [pickingId, setPickingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/audiences");
        if (r.status === 403) { setLocked(true); return; }
        const j = await r.json();
        if (!j.ok) { toast.error(j.error ?? "Failed"); return; }
        setAudiences(j.audiences);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function pick(a: AudienceRow) {
    if (a.rulesError) {
      toast.error("This audience has invalid rules — edit it first.");
      return;
    }
    if (!a.memberCount || a.memberCount === 0) {
      // Enforced server-side too, but stopping here avoids the round
      // trip and matches the design principle: never let a send
      // proceed on a zero-resolved audience.
      toast.error(`"${a.name}" has zero contacts today. Update the rules first.`);
      return;
    }
    setPickingId(a.id);
    try {
      const r = await fetch(`/api/audiences/${a.id}?rows=1`);
      const j = await r.json();
      if (!j.ok || !j.rows) {
        toast.error(j.error ?? "Failed to load audience");
        return;
      }
      const rows: Row[] = j.rows;
      const headerSet = new Set<string>(["phoneNumber"]);
      for (const row of rows) {
        for (const k of Object.keys(row)) headerSet.add(k);
      }
      const headers = ["phoneNumber", ...Array.from(headerSet).filter((h) => h !== "phoneNumber")];
      const parsed: ParsedFile = {
        fileName: `Audience — ${a.name}`,
        headers,
        rows,
        columnTypes: Object.fromEntries(headers.map((h) => [h, "text"])) as Record<string, "text">,
        sanitizedHeaders: [],
        audienceId: a.id,
        audienceName: a.name,
        audienceTotal: j.audience?.memberCount ?? rows.length,
        audienceCapped: Boolean(j.rowsCapped),
      };
      onParsed(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div className="rounded-md border bg-zinc-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-whatsapp" />
          <h3 className="text-sm font-semibold">Pick a Saved Audience</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {locked ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Saved audiences require the Growth plan.
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audiences…
        </div>
      ) : !audiences || audiences.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No saved audiences yet. Create one on the Contacts → Audiences tab.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
          {audiences.map((a) => {
            const disabled = Boolean(a.rulesError) || !a.memberCount;
            return (
              <li key={a.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.rulesError
                      ? <span className="text-red-600">Invalid rules — edit to fix</span>
                      : a.memberCount === null
                        ? "counting…"
                        : `${a.memberCount.toLocaleString()} contact${a.memberCount === 1 ? "" : "s"} match today`}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => pick(a)}
                  disabled={disabled || pickingId === a.id}
                  className="gap-1.5"
                >
                  {pickingId === a.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Use audience
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
