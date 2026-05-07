"use client";

import * as React from "react";
import { Sliders } from "lucide-react";
import { Select } from "@/components/ui/select";
import { FORMAT_RULES, type FormatRule, applyFormat } from "@/lib/buildMessage";
import type { ParsedFile, ColumnType } from "@/lib/parseFile";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  resolvedNames: string[];                 // tokens actually used in the message
  formatRules: Record<string, FormatRule>;
  onChange: (rules: Record<string, FormatRule>) => void;
}

/**
 * Number/date columns referenced in the message can be formatted.
 * Text columns get no toggle. Custom static vars are treated as text.
 */
export function FormatRulesEditor({
  parsed,
  phoneColumn,
  resolvedNames,
  formatRules,
  onChange,
}: Props) {
  const formattable = resolvedNames.filter((name) => {
    if (name === phoneColumn) return false;
    const type = parsed.columnTypes[name];
    return type === "number" || type === "date";
  });

  if (formattable.length === 0) return null;

  function setRule(name: string, value: FormatRule) {
    const next = { ...formatRules };
    if (value === "raw") delete next[name];
    else next[name] = value;
    onChange(next);
  }

  return (
    <div className="rounded-md border bg-zinc-50">
      <div className="px-3 py-2 border-b flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Sliders className="w-3 h-3" />
        Number / date formatting
      </div>
      <ul className="divide-y">
        {formattable.map((name) => {
          const type: ColumnType = parsed.columnTypes[name] ?? "text";
          const sample = parsed.rows[0]?.[name] ?? "";
          const current = formatRules[name] ?? "raw";
          const options =
            type === "date"
              ? FORMAT_RULES.filter((o) => o.value === "raw" || o.value === "date")
              : FORMAT_RULES.filter((o) => o.value !== "date");
          return (
            <li key={name} className="flex items-center gap-2 p-2.5 text-sm">
              <code className="font-mono text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                {`{{${name}}}`}
              </code>
              <Select
                value={current}
                onChange={(e) => setRule(name, e.target.value as FormatRule)}
                className="h-8 text-xs w-32 shrink-0"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted-foreground truncate">
                {sample ? (
                  <>
                    Sample: <strong>{applyFormat(sample, current)}</strong>
                  </>
                ) : (
                  <em>(no sample)</em>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
