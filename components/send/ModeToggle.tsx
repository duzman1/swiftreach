"use client";

import * as React from "react";
import { MessageSquare, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SendMode = "freeform" | "template";

interface Props {
  mode: SendMode;
  onChange: (mode: SendMode) => void;
  enableTemplate?: boolean;
}

export function ModeToggle({ mode, onChange, enableTemplate = false }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ModeOption
        active={mode === "freeform"}
        onClick={() => onChange("freeform")}
        icon={<MessageSquare className="w-5 h-5" />}
        title="Free-Form Text"
        description="For contacts who messaged your number in the last 24 hours. Full custom message with variables."
      />
      <ModeOption
        active={mode === "template"}
        onClick={() => onChange("template")}
        disabled={!enableTemplate}
        icon={<FileCheck2 className="w-5 h-5" />}
        title="Meta Approved Template"
        description="Required for outbound first contact. Type your approved template name and map each {{1}}/{{2}} to a column or static value."
      />
    </div>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "text-left rounded-md border p-4 transition-all",
        active
          ? "border-whatsapp ring-2 ring-whatsapp/30 bg-whatsapp/5"
          : "border-zinc-200 hover:border-zinc-300",
        disabled && "opacity-60 cursor-not-allowed hover:border-zinc-200"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn(
            "rounded-md p-1.5",
            active ? "bg-whatsapp text-white" : "bg-zinc-100 text-zinc-600"
          )}
        >
          {icon}
        </div>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
