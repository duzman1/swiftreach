"use client";

import * as React from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ParsedFile } from "@/lib/parseFile";
import type { VariableMapping } from "@/lib/whatsapp";

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  templateName: string;
  onTemplateName: (v: string) => void;
  templateLanguage: string;
  onTemplateLanguage: (v: string) => void;
  variableMap: VariableMapping[];
  onVariableMap: (v: VariableMapping[]) => void;
  onTestSend: () => void;
  testSending: boolean;
}

export function TemplateMapper({
  parsed,
  phoneColumn,
  templateName,
  onTemplateName,
  templateLanguage,
  onTemplateLanguage,
  variableMap,
  onVariableMap,
  onTestSend,
  testSending,
}: Props) {
  const insertableHeaders = parsed.headers.filter((h) => h !== phoneColumn);

  function addRow() {
    const next = [...variableMap];
    next.push({
      metaVar: String(next.length + 1),
      source: "column",
      column: insertableHeaders[0] ?? "",
    });
    onVariableMap(next);
  }

  function updateRow(i: number, patch: Partial<VariableMapping>) {
    const next = variableMap.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onVariableMap(next);
  }

  function removeRow(i: number) {
    const next = variableMap
      .filter((_, idx) => idx !== i)
      .map((m, idx) => ({ ...m, metaVar: String(idx + 1) }));
    onVariableMap(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr,auto] gap-3 items-end">
        <div>
          <Label htmlFor="template-name" className="block mb-1.5">
            Template name
          </Label>
          <Input
            id="template-name"
            value={templateName}
            onChange={(e) => onTemplateName(e.target.value)}
            placeholder="exact_template_name_from_meta"
          />
        </div>
        <div>
          <Label htmlFor="template-lang" className="block mb-1.5">
            Language
          </Label>
          <Input
            id="template-lang"
            value={templateLanguage}
            onChange={(e) => onTemplateLanguage(e.target.value)}
            placeholder="en_US"
          />
        </div>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-whatsapp hover:underline inline-flex items-center gap-1 pb-3"
        >
          <ExternalLink className="w-3 h-3" />
          Meta template manager
        </a>
      </div>

      <div className="rounded-md border bg-zinc-50">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Variable mapping
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            Add variable
          </Button>
        </div>

        {variableMap.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">
            No variables mapped yet. Add a row for each <code>{"{{1}}"}</code>,{" "}
            <code>{"{{2}}"}</code>, etc. that your template uses.
          </p>
        ) : (
          <ul className="divide-y">
            {variableMap.map((m, i) => (
              <li key={i} className="p-3 grid grid-cols-1 md:grid-cols-[80px,120px,1fr,auto] gap-2 items-center">
                <code className="text-xs font-mono text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-1.5 text-center">
                  {`{{${m.metaVar}}}`}
                </code>
                <Select
                  value={m.source}
                  onChange={(e) =>
                    updateRow(i, { source: e.target.value as "column" | "static" })
                  }
                >
                  <option value="column">From column</option>
                  <option value="static">Static value</option>
                </Select>
                {m.source === "column" ? (
                  <Select
                    value={m.column ?? ""}
                    onChange={(e) => updateRow(i, { column: e.target.value })}
                  >
                    <option value="">Select column…</option>
                    {insertableHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={m.value ?? ""}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    placeholder="Same value for every contact"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onTestSend}
          disabled={testSending || !templateName.trim()}
          className="gap-1"
        >
          Test template (uses first contact)
        </Button>
      </div>
    </div>
  );
}
