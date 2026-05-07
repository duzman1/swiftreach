"use client";

import * as React from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FILTER_OPS, type FilterRule, applyFilters } from "@/lib/applyFilters";
import type { ParsedFile } from "@/lib/parseFile";
import { cn } from "@/lib/utils";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  campaignName: string;
  onCampaignName: (v: string) => void;
  delayMs: number;
  onDelayMs: (v: number) => void;
  filters: FilterRule[];
  onFilters: (v: FilterRule[]) => void;
}

export function CampaignSettings({
  parsed,
  phoneColumn,
  campaignName,
  onCampaignName,
  delayMs,
  onDelayMs,
  filters,
  onFilters,
}: Props) {
  const matching = React.useMemo(
    () => applyFilters(parsed.rows, filters).length,
    [parsed.rows, filters]
  );
  const total = parsed.rows.length;

  function addFilter() {
    const firstNonPhone = parsed.headers.find((h) => h !== phoneColumn) ?? "";
    onFilters([...filters, { column: firstNonPhone, op: "is_not_empty", value: "" }]);
  }
  function updateFilter(i: number, patch: Partial<FilterRule>) {
    onFilters(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeFilter(i: number) {
    onFilters(filters.filter((_, idx) => idx !== i));
  }

  const lowDelay = delayMs < 1500;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="campaign-name" className="block mb-1.5">
            Campaign name
          </Label>
          <Input
            id="campaign-name"
            value={campaignName}
            onChange={(e) => onCampaignName(e.target.value)}
            placeholder="e.g. May 2026 Reminder"
          />
        </div>

        <div>
          <Label htmlFor="delay" className="block mb-1.5">
            Delay between messages: <strong>{(delayMs / 1000).toFixed(1)}s</strong>
          </Label>
          <input
            id="delay"
            type="range"
            min={1000}
            max={10000}
            step={500}
            value={delayMs}
            onChange={(e) => onDelayMs(Number(e.target.value))}
            className="w-full accent-whatsapp"
          />
          {lowDelay && (
            <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Lower delays may trigger Meta rate limits.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-zinc-50">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Contact filters (optional)
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addFilter} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            Add filter
          </Button>
        </div>

        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">
            No filters — sending to all {total} contacts.
          </p>
        ) : (
          <ul className="divide-y">
            {filters.map((f, i) => {
              const opMeta = FILTER_OPS.find((o) => o.value === f.op) ?? FILTER_OPS[0];
              return (
                <li key={i} className="p-3 grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,auto] gap-2 items-center">
                  <Select
                    value={f.column}
                    onChange={(e) => updateFilter(i, { column: e.target.value })}
                  >
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={f.op}
                    onChange={(e) => updateFilter(i, { op: e.target.value as FilterRule["op"] })}
                  >
                    {FILTER_OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={f.value}
                    disabled={!opMeta.needsValue}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    placeholder={opMeta.needsValue ? "value" : "(no value needed)"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFilter(i)}
                    aria-label="Remove filter"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-3 py-2 border-t bg-background text-sm">
          <span className={cn(matching === 0 && "text-red-600")}>
            <strong>{matching}</strong> of {total} contact{total === 1 ? "" : "s"} match your filters.
          </span>
        </div>
      </div>
    </div>
  );
}
