"use client";

import * as React from "react";
import { Bold, Italic, Strikethrough, Code } from "lucide-react";
import { TokenTextarea } from "./TokenTextarea";
import type { TokenSpan } from "@/lib/buildMessage";
import { cn } from "@/lib/utils";

const MAX_LEN = 4096;

interface Props {
  value: string;
  onChange: (value: string) => void;
  spans: TokenSpan[];
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}

export function MessageEditor({ value, onChange, spans, textareaRef }: Props) {
  const len = value.length;
  const overLimit = len >= MAX_LEN;

  function wrapSelection(left: string, right: string = left) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? start;
    const before = value.slice(0, start);
    const middle = value.slice(start, end);
    const after = value.slice(end);
    const next = `${before}${left}${middle}${right}${after}`;
    onChange(next.slice(0, MAX_LEN));
    // Restore selection inside the wrapper
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + left.length;
      const newEnd = newStart + middle.length;
      ta.setSelectionRange(newStart, newEnd);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 border rounded-md p-1 bg-zinc-50 w-fit">
        <FormatBtn label="Bold (*text*)" onClick={() => wrapSelection("*")}>
          <Bold className="w-3.5 h-3.5" />
        </FormatBtn>
        <FormatBtn label="Italic (_text_)" onClick={() => wrapSelection("_")}>
          <Italic className="w-3.5 h-3.5" />
        </FormatBtn>
        <FormatBtn label="Strikethrough (~text~)" onClick={() => wrapSelection("~")}>
          <Strikethrough className="w-3.5 h-3.5" />
        </FormatBtn>
        <FormatBtn label="Monospace (```text```)" onClick={() => wrapSelection("```")}>
          <Code className="w-3.5 h-3.5" />
        </FormatBtn>
      </div>

      <TokenTextarea
        value={value}
        onChange={onChange}
        spans={spans}
        textareaRef={textareaRef}
        maxLength={MAX_LEN}
        placeholder="Type your message. Click a chip above to insert a variable."
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>WhatsApp formatting: *bold* _italic_ ~strike~ ```mono```</span>
        <span className={cn(overLimit && "text-red-600 font-medium")}>
          {len.toLocaleString()} / {MAX_LEN.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function FormatBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 hover:text-foreground"
    >
      {children}
    </button>
  );
}
