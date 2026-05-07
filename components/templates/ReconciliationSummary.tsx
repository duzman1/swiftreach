"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type Resolution =
  | { kind: "matched"; column: string }
  | { kind: "static"; value: string }
  | { kind: "column"; column: string }
  | { kind: "unresolved" };

interface Props {
  templateName: string;
  tokens: string[];
  fileColumns: string[];           // exact non-phone column headers
  resolutions: Record<string, Resolution>;
  onChange: (token: string, res: Resolution) => void;
  onApply: () => void;
  onCancel: () => void;
}

/**
 * Shown after a template is loaded with a file already uploaded. For each
 * token the template uses, we display whether the token matches a file column,
 * matches an existing custom var, or needs the user's input.
 */
export function ReconciliationSummary({
  templateName,
  tokens,
  fileColumns,
  resolutions,
  onChange,
  onApply,
  onCancel,
}: Props) {
  const matched = tokens.filter((t) => resolutions[t]?.kind === "matched").length;
  const needsInput = tokens.filter((t) => {
    const r = resolutions[t];
    return !r || r.kind === "unresolved";
  }).length;

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-sky-700 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sky-900">
            Template loaded: <span className="font-mono text-sm">&ldquo;{templateName}&rdquo;</span>
          </h3>
          <div className="text-xs text-sky-800 mt-0.5 flex flex-wrap gap-x-4">
            {matched > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {matched} matched your file column{matched === 1 ? "" : "s"}
              </span>
            )}
            {needsInput > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {needsInput} need{needsInput === 1 ? "s" : ""} a value
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {tokens.map((token) => {
          const res = resolutions[token] ?? { kind: "unresolved" };
          return (
            <li key={token} className="grid grid-cols-1 md:grid-cols-[1fr,140px,1fr] gap-2 items-center bg-background rounded p-2">
              <code className="font-mono text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-1.5">
                {`{{${token}}}`}
              </code>
              <Select
                value={res.kind === "matched" ? "matched" : res.kind === "static" ? "static" : res.kind === "column" ? "column" : "unresolved"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "matched") onChange(token, { kind: "matched", column: token });
                  else if (v === "column") onChange(token, { kind: "column", column: fileColumns[0] ?? "" });
                  else if (v === "static") onChange(token, { kind: "static", value: "" });
                  else onChange(token, { kind: "unresolved" });
                }}
                className="h-9 text-xs"
              >
                {fileColumns.includes(token) && (
                  <option value="matched">Auto-matched</option>
                )}
                <option value="column">Pick column</option>
                <option value="static">Static value</option>
                <option value="unresolved">Skip / leave empty</option>
              </Select>

              {res.kind === "matched" && (
                <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Matches column <strong>{res.column}</strong>
                </span>
              )}
              {res.kind === "column" && (
                <Select
                  value={res.column}
                  onChange={(e) => onChange(token, { kind: "column", column: e.target.value })}
                  className="h-9 text-xs"
                >
                  {fileColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              )}
              {res.kind === "static" && (
                <Input
                  value={res.value}
                  onChange={(e) => onChange(token, { kind: "static", value: e.target.value })}
                  placeholder="Same value for every contact"
                  className="h-9 text-xs"
                />
              )}
              {res.kind === "unresolved" && (
                <span className="text-xs text-muted-foreground">
                  Will appear as <code>{`{{${token}}}`}</code> literal in the message.
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2 pt-2 border-t border-sky-200">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onApply}>
          Apply template
        </Button>
      </div>
    </div>
  );
}
