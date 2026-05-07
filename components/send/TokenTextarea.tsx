"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TokenSpan } from "@/lib/buildMessage";

interface Props {
  value: string;
  onChange: (value: string) => void;
  spans: TokenSpan[];
  placeholder?: string;
  maxLength?: number;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}

/**
 * Textarea with an overlay div that highlights {{tokens}} inline.
 * Standard "two stacked layers" technique:
 *  - Hidden div behind the textarea, same font/padding, renders styled spans
 *  - Textarea on top with transparent text & caret showing
 * Scroll positions of both layers are kept in sync.
 */
export function TokenTextarea({
  value,
  onChange,
  spans,
  placeholder,
  maxLength = 4096,
  textareaRef,
}: Props) {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const ref = textareaRef ?? localRef;

  function syncScroll() {
    if (overlayRef.current && ref.current) {
      overlayRef.current.scrollTop = ref.current.scrollTop;
      overlayRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }

  // Re-sync when value changes (line wraps may shift heights).
  React.useLayoutEffect(syncScroll, [value, spans]);

  const segments = React.useMemo(() => buildSegments(value, spans), [value, spans]);

  return (
    <div className="relative">
      <div
        ref={overlayRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-auto whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm leading-6 font-sans"
        )}
        // Pad-bottom matches textarea so wrapping math agrees.
        style={{ wordWrap: "break-word" }}
      >
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            // Trailing newline needs to render as a real br so the overlay
            // keeps height parity with the textarea.
            return <span key={i}>{seg.text}</span>;
          }
          return (
            <span
              key={i}
              className={cn(
                "rounded-sm font-medium",
                seg.resolved
                  ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                  : "bg-red-100 text-red-700 ring-1 ring-red-200"
              )}
            >
              {seg.text}
            </span>
          );
        })}
        {/* Trailing newlines need padding so caret stays visible at bottom */}
        {value.endsWith("\n") && <span>{"​"}</span>}
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        rows={10}
        className={cn(
          "relative z-10 block w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-6 font-sans",
          "text-transparent caret-foreground selection:bg-sky-300/40 selection:text-foreground",
          "placeholder:text-muted-foreground placeholder:!text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "min-h-[180px]"
        )}
        // When there's no value, show placeholder via a separate technique:
        // browser shows it in placeholder color regardless of `text-transparent`.
      />
    </div>
  );
}

type Segment =
  | { kind: "text"; text: string }
  | { kind: "token"; text: string; resolved: boolean };

function buildSegments(value: string, spans: TokenSpan[]): Segment[] {
  if (spans.length === 0) return [{ kind: "text", text: value }];
  const out: Segment[] = [];
  let cursor = 0;
  // Spans are in source order from matchAll, so this is safe.
  for (const span of spans) {
    if (span.start > cursor) {
      out.push({ kind: "text", text: value.slice(cursor, span.start) });
    }
    out.push({
      kind: "token",
      text: value.slice(span.start, span.end),
      resolved: span.resolved,
    });
    cursor = span.end;
  }
  if (cursor < value.length) {
    out.push({ kind: "text", text: value.slice(cursor) });
  }
  return out;
}
