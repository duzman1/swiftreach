"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { buildMessage, type FormatRule } from "@/lib/buildMessage";
import { isValidPhone } from "@/lib/phoneUtils";
import { cn } from "@/lib/utils";
import type { ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  template: string;
  staticVars: Record<string, string>;
  formatRules: Record<string, FormatRule>;
}

export function LivePreview({
  parsed,
  phoneColumn,
  template,
  staticVars,
  formatRules,
}: Props) {
  const [index, setIndex] = React.useState(0);

  // Reset to first contact when the file changes (different number of rows).
  React.useEffect(() => {
    setIndex(0);
  }, [parsed.rows.length]);

  const total = parsed.rows.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const row = parsed.rows[safeIndex] ?? {};
  const phone = phoneColumn ? row[phoneColumn] : "";
  const phoneOK = isValidPhone(phone);

  const personalized = buildMessage({
    template,
    rowData: row,
    staticVars,
    formatRules,
  });

  // Pick a sensible "name" label using whatever non-phone column has a value.
  const nameLabel = React.useMemo(() => {
    if (!phoneColumn) return "";
    for (const h of parsed.headers) {
      if (h === phoneColumn) continue;
      if (row[h]) return row[h];
    }
    return "";
  }, [parsed.headers, phoneColumn, row]);

  return (
    <div className="rounded-md border bg-background flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <h3 className="font-medium text-sm">Live Preview</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {total === 0 ? "No contacts" : `Contact ${safeIndex + 1} of ${total}`}
        </span>
      </div>

      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Select
          aria-label="Select contact"
          value={String(safeIndex)}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="h-9 text-xs flex-1"
        >
          {parsed.rows.map((r, i) => {
            const label = phoneColumn
              ? `${i + 1}. ${pickRowLabel(r, parsed.headers, phoneColumn)} — ${r[phoneColumn] || "(no phone)"}`
              : `Row ${i + 1}`;
            return (
              <option key={i} value={i}>
                {label}
              </option>
            );
          })}
        </Select>
      </div>

      <div className="flex-1 p-4 bg-zinc-50">
        <div className="bg-whatsapp-light text-foreground rounded-lg rounded-tl-sm p-3 max-w-[90%] shadow-sm whitespace-pre-wrap break-words text-sm leading-6 min-h-[120px]">
          {personalized || (
            <span className="italic text-muted-foreground">
              Your message will appear here.
            </span>
          )}
        </div>

        {phoneColumn && (
          <div className={cn(
            "mt-3 text-xs flex items-center gap-1.5",
            phoneOK ? "text-muted-foreground" : "text-red-600"
          )}>
            <Phone className="w-3 h-3" />
            <span>{phone || "(no phone number)"}</span>
            {!phoneOK && phone && <span>· invalid (will be skipped)</span>}
            {nameLabel && phoneOK && <span>· {nameLabel}</span>}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={safeIndex === 0}
          className="gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          {total === 0 ? "" : `${safeIndex + 1} / ${total}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={safeIndex >= total - 1}
          className="gap-1"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function pickRowLabel(
  row: Record<string, string>,
  headers: string[],
  phoneColumn: string
): string {
  for (const h of headers) {
    if (h === phoneColumn) continue;
    if (row[h]) return String(row[h]).slice(0, 30);
  }
  return "(no label)";
}
