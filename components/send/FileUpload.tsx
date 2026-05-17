"use client";

// File upload step in the New Campaign flow. State machine:
//
//   idle → file_dropped →
//     (CSV or 1 non-empty sheet) → parsing → done
//     (2+ non-empty sheets)      → sheet_selection → parsing → done
//
// The sheet-selection branch is reached only for Excel files with more
// than one non-empty tab — single-tab xlsx and CSVs skip the picker
// entirely. A subtle notice is shown in the "done" state when a sheet
// was auto-selected so the user knows which one we used.

import * as React from "react";
import { Upload, FileSpreadsheet, X, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  detectSheets,
  parseSheetByIndex,
  type ParsedFile,
  type SheetDetection,
} from "@/lib/parseFile";
import { SheetPicker } from "./SheetPicker";

interface Props {
  parsed: ParsedFile | null;
  onParsed: (file: ParsedFile) => void;
  onClear: () => void;
}

const ACCEPTED = ".xlsx,.xlsm,.csv";

// Rows beyond this trigger a soft warning on the confirmation chip.
const LARGE_ROW_THRESHOLD = 1000;

type Phase =
  | { kind: "idle" }
  | { kind: "reading" } // detecting sheets
  | { kind: "sheet_selection"; file: File; detection: SheetDetection }
  | { kind: "parsing"; sheetName?: string }
  | { kind: "error"; message: string };

export function FileUpload({ parsed, onParsed, onClear }: Props) {
  const [dragActive, setDragActive] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  // Tracks whether the parsed file was auto-selected from a multi-sheet
  // workbook (only one tab had data). Used to show the "Using sheet: X"
  // notice in the done view.
  const [autoSheetNotice, setAutoSheetNotice] = React.useState<string | null>(
    null
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Parse the chosen sheet and finish the flow.
  const finishParse = React.useCallback(
    async (file: File, sheetIndex: number) => {
      setPhase({ kind: "parsing" });
      try {
        const result = await parseSheetByIndex(file, sheetIndex);
        if (result.headers.length === 0) {
          throw new Error("No column headers found in the first row.");
        }
        if (result.rows.length === 0) {
          throw new Error("File contains headers but no data rows.");
        }
        onParsed(result);
        setPhase({ kind: "idle" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to parse file.";
        setPhase({ kind: "error", message });
      }
    },
    [onParsed]
  );

  // Entry point when a new file is dropped or picked. Branches based on
  // sheet detection.
  const handleFile = React.useCallback(
    async (file: File) => {
      setAutoSheetNotice(null);
      setPhase({ kind: "reading" });
      try {
        const detection = await detectSheets(file);

        // CSVs → detection returns a synthetic sheet with index 0 and
        // needsSelection:false. Parse directly.
        const lower = file.name.toLowerCase();
        const isCsv = lower.endsWith(".csv");

        if (isCsv) {
          await finishParse(file, 0);
          return;
        }

        const nonEmpty = detection.sheets.filter((s) => !s.isEmpty);
        if (nonEmpty.length === 0) {
          throw new Error(
            "This file appears to be empty. Please check your file and try again."
          );
        }

        if (!detection.needsSelection) {
          // Single non-empty sheet — auto-parse, but tell the user which
          // one we picked when the workbook had multiple sheets (some
          // empty) so the import isn't silently wrong.
          const auto = detection.sheets[detection.defaultSheetIndex];
          if (auto && detection.sheets.length > 1) {
            setAutoSheetNotice(`${auto.name} (${auto.rowCount} rows)`);
          }
          await finishParse(file, detection.defaultSheetIndex);
          return;
        }

        // 2+ non-empty sheets → render the picker.
        setPhase({ kind: "sheet_selection", file, detection });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not read this file. Make sure it is a valid Excel (.xlsx) or CSV file.";
        setPhase({ kind: "error", message });
      }
    },
    [finishParse]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  // ── Render: done state (file is parsed) ────────────────────────────────
  if (parsed) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-md border bg-zinc-50 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-md bg-whatsapp/10 text-whatsapp p-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{parsed.fileName}</div>
              <div className="text-xs text-muted-foreground">
                {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ·{" "}
                {parsed.headers.length} column{parsed.headers.length === 1 ? "" : "s"}
                {parsed.sheetName ? ` · sheet "${parsed.sheetName}"` : ""}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAutoSheetNotice(null);
              onClear();
            }}
            className="gap-1"
          >
            <X className="w-4 h-4" />
            Remove
          </Button>
        </div>

        {autoSheetNotice && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Using sheet: <span className="font-medium">{autoSheetNotice}</span>
          </div>
        )}

        {parsed.rows.length > LARGE_ROW_THRESHOLD && (
          <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Large file detected ({parsed.rows.length.toLocaleString()} rows).
              Plan limits apply per campaign send.
            </span>
          </div>
        )}

        {parsed.sanitizedHeaders.length > 0 && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <div className="flex items-center gap-1.5 font-medium mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Cleaned {parsed.sanitizedHeaders.length} header
              {parsed.sanitizedHeaders.length === 1 ? "" : "s"} with hidden
              characters
            </div>
            <ul className="space-y-0.5">
              {parsed.sanitizedHeaders.slice(0, 5).map((s) => (
                <li key={s.original} className="font-mono text-[11px]">
                  <span className="line-through text-sky-700/70">
                    {visualize(s.original)}
                  </span>
                  {" → "}
                  <span className="font-semibold">{s.cleaned}</span>
                </li>
              ))}
              {parsed.sanitizedHeaders.length > 5 && (
                <li className="text-sky-700/80">
                  …and {parsed.sanitizedHeaders.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Render: sheet picker ───────────────────────────────────────────────
  if (phase.kind === "sheet_selection") {
    return (
      <SheetPicker
        fileName={phase.file.name}
        sheets={phase.detection.sheets}
        defaultSheetIndex={phase.detection.defaultSheetIndex}
        onConfirm={(idx) => {
          void finishParse(phase.file, idx);
        }}
        onCancel={() => setPhase({ kind: "idle" })}
      />
    );
  }

  // ── Render: drop zone + transient states (reading / parsing / error) ──
  const busy = phase.kind === "reading" || phase.kind === "parsing";
  const statusText =
    phase.kind === "reading"
      ? "Reading file..."
      : phase.kind === "parsing"
      ? "Parsing sheet..."
      : "Drop a file here, or";

  return (
    <div className="space-y-2">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "border-2 border-dashed rounded-md p-10 text-center transition-colors",
          dragActive ? "border-whatsapp bg-whatsapp/5" : "border-zinc-300",
          busy && "opacity-60 pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={onPick}
          className="hidden"
        />
        <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-3" />
        <div className="font-medium text-sm">{statusText}</div>
        <div className="mt-3">
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload file
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          Supports .xlsx, .xlsm, .csv. The first row should contain column headers.
        </div>
      </div>

      {phase.kind === "error" && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 flex items-start justify-between gap-3">
          <span>{phase.message}</span>
          <button
            type="button"
            onClick={() => setPhase({ kind: "idle" })}
            className="text-xs underline whitespace-nowrap"
          >
            Try a different file
          </button>
        </div>
      )}
    </div>
  );
}

// Render every space and every invisible Unicode char as a visible glyph so
// the user can see what was hidden in the original header. The regex is built
// from explicit code points to keep this source file free of literal
// invisibles (which are easy to corrupt in copy-paste).
const INVISIBLE_RE = (() => {
  const ch = (cp: number) => String.fromCharCode(cp);
  const range = (a: number, b: number) => `${ch(a)}-${ch(b)}`;
  return new RegExp(
    "[" +
      ch(0x00a0) +
      range(0x2000, 0x200a) +
      ch(0x202f) +
      ch(0x205f) +
      ch(0x3000) +
      range(0x200b, 0x200d) +
      ch(0x2060) +
      ch(0xfeff) +
      "]",
    "g"
  );
})();

function visualize(s: string): string {
  return s.replace(/ /g, "·").replace(INVISIBLE_RE, "•");
}
