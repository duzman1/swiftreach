"use client";

import * as React from "react";
import { Upload, FileSpreadsheet, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { parseContactFile, type ParsedFile } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile | null;
  onParsed: (file: ParsedFile) => void;
  onClear: () => void;
}

const ACCEPTED = ".xlsx,.xlsm,.csv";

export function FileUpload({ parsed, onParsed, onClear }: Props) {
  const [dragActive, setDragActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const result = await parseContactFile(file);
        if (result.headers.length === 0) {
          throw new Error("No column headers found in the first row.");
        }
        if (result.rows.length === 0) {
          throw new Error("File contains headers but no data rows.");
        }
        onParsed(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to parse file.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [onParsed]
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
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
            <X className="w-4 h-4" />
            Remove
          </Button>
        </div>

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

  return (
    <div className="space-y-2">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "border-2 border-dashed rounded-md p-10 text-center transition-colors",
          dragActive
            ? "border-whatsapp bg-whatsapp/5"
            : "border-zinc-300",
          loading && "opacity-60 pointer-events-none"
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
        <div className="font-medium text-sm">
          {loading ? "Reading file..." : "Drop a file here, or"}
        </div>
        <div className="mt-3">
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
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

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {error}
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
