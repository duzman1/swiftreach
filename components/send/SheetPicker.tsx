"use client";

// Modal-card picker shown after a multi-sheet Excel file is dropped.
// Lets the user choose which sheet to import. Empty sheets are visible
// but disabled so the user understands why some options aren't pickable.

import * as React from "react";
import { ArrowLeft, ArrowRight, Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SheetMeta } from "@/lib/parseFile";

interface Props {
  fileName: string;
  sheets: SheetMeta[];
  defaultSheetIndex: number;
  onConfirm: (sheetIndex: number) => void;
  onCancel: () => void;
  loading?: boolean;
}

function truncate(name: string, max = 30): { display: string; truncated: boolean } {
  if (name.length <= max) return { display: name, truncated: false };
  return { display: `${name.slice(0, max - 1)}…`, truncated: true };
}

export function SheetPicker({
  fileName,
  sheets,
  defaultSheetIndex,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const [selected, setSelected] = React.useState(defaultSheetIndex);
  const nonEmptyCount = sheets.filter((s) => !s.isEmpty).length;
  const totalCount = sheets.length;

  // Guard: if the default switches (e.g. parent re-detects) keep selection
  // pointed at the recommended sheet.
  React.useEffect(() => {
    setSelected(defaultSheetIndex);
  }, [defaultSheetIndex]);

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-whatsapp/10 text-whatsapp p-2 shrink-0">
          <Table2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm">Multiple sheets detected</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-medium text-zinc-700">{fileName}</span> has{" "}
            {totalCount} sheet{totalCount === 1 ? "" : "s"}
            {nonEmptyCount !== totalCount &&
              ` (${nonEmptyCount} with data)`}
            . Which sheet contains your contacts?
          </div>
        </div>
      </div>

      <div className="rounded-md border divide-y">
        {sheets.map((s) => {
          const isSelected = selected === s.index;
          const isRecommended = s.index === defaultSheetIndex && !s.isEmpty;
          const { display, truncated } = truncate(s.name);
          return (
            <label
              key={s.index}
              title={truncated ? s.name : undefined}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                s.isEmpty
                  ? "bg-zinc-50 text-zinc-400 cursor-not-allowed"
                  : "cursor-pointer hover:bg-emerald-50/30",
                isSelected && !s.isEmpty && "bg-emerald-50/50 ring-1 ring-whatsapp"
              )}
            >
              <input
                type="radio"
                name="sheet"
                disabled={s.isEmpty}
                checked={isSelected}
                onChange={() => setSelected(s.index)}
                className="w-4 h-4 accent-[color:var(--color-whatsapp,#25D366)]"
              />
              <span className="flex-1 min-w-0 truncate font-medium">
                {display}
              </span>
              {isRecommended && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <Sparkles className="w-3 h-3" />
                  Recommended
                </span>
              )}
              <span
                className={cn(
                  "text-xs tabular-nums shrink-0",
                  s.isEmpty ? "text-zinc-400" : "text-zinc-500"
                )}
              >
                {s.rowCount} row{s.rowCount === 1 ? "" : "s"}
                {s.isEmpty && " (empty)"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={loading}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Choose different file
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(selected)}
          disabled={loading || sheets[selected]?.isEmpty}
          className="gap-1"
        >
          {loading ? "Loading..." : "Use This Sheet"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
