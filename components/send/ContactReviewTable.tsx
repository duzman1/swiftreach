"use client";

import * as React from "react";
import { Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MessagePreviewModal } from "./MessagePreviewModal";
import { buildMessage, type FormatRule } from "@/lib/buildMessage";
import { applyFilters, type FilterRule } from "@/lib/applyFilters";
import { isValidPhone, normalizePhone } from "@/lib/phoneUtils";
import { cn } from "@/lib/utils";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  defaultCountryCode: string;
  template: string;
  staticVars: Record<string, string>;
  formatRules: Record<string, FormatRule>;
  filters: FilterRule[];
  // Index here = position within filteredRows (post-filters), not parsed.rows
  skippedIndices: number[];
  onSkippedIndicesChange: (next: number[]) => void;
}

type FilterMode = "all" | "valid" | "invalid" | "selected" | "skipped";

export function ContactReviewTable({
  parsed,
  phoneColumn,
  defaultCountryCode,
  template,
  staticVars,
  formatRules,
  filters,
  skippedIndices,
  onSkippedIndicesChange,
}: Props) {
  const [search, setSearch] = React.useState("");
  const [filterMode, setFilterMode] = React.useState<FilterMode>("all");
  const [previewIdx, setPreviewIdx] = React.useState<number | null>(null);

  const filteredRows = React.useMemo(
    () => applyFilters(parsed.rows, filters),
    [parsed.rows, filters]
  );

  const skipped = React.useMemo(() => new Set(skippedIndices), [skippedIndices]);

  type Annotated = {
    index: number;
    row: Record<string, string>;
    phone: string;
    valid: boolean;
    selected: boolean;
    message: string;
  };

  const annotated: Annotated[] = React.useMemo(() => {
    return filteredRows.map((row, i) => {
      const phoneRaw = row[phoneColumn] ?? "";
      const phone = normalizePhone(phoneRaw, defaultCountryCode);
      const valid = isValidPhone(phone);
      const message = buildMessage({
        template,
        rowData: row,
        staticVars,
        formatRules,
      });
      return {
        index: i,
        row,
        phone,
        valid,
        selected: !skipped.has(i),
        message,
      };
    });
  }, [filteredRows, phoneColumn, defaultCountryCode, template, staticVars, formatRules, skipped]);

  const visible = React.useMemo(() => {
    const lower = search.toLowerCase();
    return annotated.filter((a) => {
      if (filterMode === "valid" && !a.valid) return false;
      if (filterMode === "invalid" && a.valid) return false;
      if (filterMode === "selected" && !a.selected) return false;
      if (filterMode === "skipped" && a.selected) return false;
      if (lower) {
        const hay = [a.phone, ...Object.values(a.row)].join(" ").toLowerCase();
        if (!hay.includes(lower)) return false;
      }
      return true;
    });
  }, [annotated, filterMode, search]);

  function toggleOne(idx: number, on: boolean) {
    const next = new Set(skippedIndices);
    if (on) next.delete(idx);
    else next.add(idx);
    onSkippedIndicesChange(Array.from(next));
  }

  function selectAllVisible(on: boolean) {
    const next = new Set(skippedIndices);
    for (const a of visible) {
      if (!a.valid) continue; // can't select invalid
      if (on) next.delete(a.index);
      else next.add(a.index);
    }
    onSkippedIndicesChange(Array.from(next));
  }

  const validCount = annotated.filter((a) => a.valid).length;
  const invalidCount = annotated.length - validCount;
  const selectedCount = annotated.filter((a) => a.selected && a.valid).length;
  const allVisibleSelected =
    visible.length > 0 && visible.every((a) => !a.valid || a.selected);

  // Display columns: phone first, then up to 3 other columns for context
  const displayCols = parsed.headers
    .filter((h) => h !== phoneColumn)
    .slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search phone, name, or any field…"
            className="pl-8"
          />
        </div>
        <Select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          className="w-32"
        >
          <option value="all">All</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="selected">Selected</option>
          <option value="skipped">Skipped</option>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
        <span>Total: <strong>{annotated.length}</strong></span>
        <span className="text-emerald-700">Valid: <strong>{validCount}</strong></span>
        {invalidCount > 0 && (
          <span className="text-orange-700">Invalid: <strong>{invalidCount}</strong></span>
        )}
        <span className="text-sky-700">Will send to: <strong>{selectedCount}</strong></span>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => selectAllVisible(e.target.checked)}
                    aria-label="Select all visible"
                  />
                </th>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Phone</th>
                {displayCols.map((c) => (
                  <th key={c} className="p-2 text-left">
                    {c}
                  </th>
                ))}
                <th className="p-2 text-left">Message preview</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.index}
                  className={cn(
                    "border-t hover:bg-zinc-50",
                    !a.valid && "bg-red-50/40",
                    !a.selected && a.valid && "opacity-50"
                  )}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={a.selected}
                      disabled={!a.valid}
                      onChange={(e) => toggleOne(a.index, e.target.checked)}
                      aria-label={`Select contact ${a.index + 1}`}
                    />
                  </td>
                  <td className="p-2 text-muted-foreground">{a.index + 1}</td>
                  <td
                    className={cn(
                      "p-2 font-mono text-xs",
                      !a.valid && "text-red-600"
                    )}
                    title={!a.valid ? "Invalid phone — fewer than 10 digits" : ""}
                  >
                    {a.phone || "(none)"}
                  </td>
                  {displayCols.map((c) => (
                    <td key={c} className="p-2 truncate max-w-[160px]">
                      {a.row[c] ?? ""}
                    </td>
                  ))}
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[280px] text-muted-foreground text-xs">
                        {a.message.slice(0, 60) || <em>(empty)</em>}
                        {a.message.length > 60 ? "…" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewIdx(a.index)}
                        className="text-xs text-whatsapp hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + displayCols.length}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    No contacts match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSkippedIndicesChange([])}
        >
          Reset selection
        </Button>
        <span className="text-muted-foreground">
          Click a row&apos;s &quot;View&quot; to see the full personalized message.
        </span>
      </div>

      <MessagePreviewModal
        open={previewIdx !== null}
        onClose={() => setPreviewIdx(null)}
        title={
          previewIdx !== null
            ? `Contact ${previewIdx + 1} — ${
                annotated[previewIdx]?.phone ?? ""
              }`
            : ""
        }
        message={previewIdx !== null ? annotated[previewIdx]?.message ?? "" : ""}
      />
    </div>
  );
}
