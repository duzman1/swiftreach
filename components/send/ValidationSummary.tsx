"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Plus, Lightbulb } from "lucide-react";
import type { ValidationResult } from "@/lib/buildMessage";
import { suggestClosest } from "@/lib/fuzzyMatch";

interface Props {
  result: ValidationResult;
  // Full pool of candidate names (file headers + custom var names) used to
  // suggest "did you mean?" for unknown tokens.
  candidateNames: string[];
  onAddUnknown: (name: string) => void;
  // Replace an unknown token in the message with the suggested name.
  onReplaceToken: (oldName: string, newName: string) => void;
}

export function ValidationSummary({
  result,
  candidateNames,
  onAddUnknown,
  onReplaceToken,
}: Props) {
  if (result.tokens.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No variables in your message yet.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        {result.resolved.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            {result.resolved.length} variable
            {result.resolved.length === 1 ? "" : "s"} resolved
          </span>
        )}
        {result.unknown.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <AlertCircle className="w-4 h-4" />
            {result.unknown.length} unknown
          </span>
        )}
      </div>

      {result.unknown.length > 0 && (
        <ul className="space-y-1.5">
          {result.unknown.map((name) => {
            const suggestion = suggestClosest(name, candidateNames);
            return (
              <li
                key={name}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs">
                    <code className="font-mono text-red-800">{`{{${name}}}`}</code>{" "}
                    <span className="text-red-700">
                      is not in your variable pool.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddUnknown(name)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-whatsapp hover:underline shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    Add as custom variable
                  </button>
                </div>

                {suggestion && (
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="inline-flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      Did you mean{" "}
                      <code className="font-mono font-medium">{`{{${suggestion}}}`}</code>?
                    </span>
                    <button
                      type="button"
                      onClick={() => onReplaceToken(name, suggestion)}
                      className="font-medium text-amber-900 hover:underline shrink-0"
                    >
                      Use this instead
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
