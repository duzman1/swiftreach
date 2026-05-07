"use client";

import * as React from "react";
import { X, Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TokenTextarea } from "@/components/send/TokenTextarea";
import { findTokenSpans, type FormatRule } from "@/lib/buildMessage";
import { toast } from "sonner";

export interface EditableTemplate {
  id?: string;
  name: string;
  description?: string | null;
  content: string;
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
}

interface Props {
  open: boolean;
  initial?: EditableTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TemplateEditor({ open, initial, onClose, onSaved }: Props) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when modal opens / initial changes
  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setContent(initial?.content ?? "");
    setError(null);
  }, [open, initial]);

  // Esc closes
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, saving, onClose]);

  // Highlight tokens against an empty pool so all tokens render as "unknown"
  // (red). That's actually ideal — we want to show users the tokens they
  // wrote, knowing real reconciliation happens at load-time in the wizard.
  const spans = React.useMemo(
    () => findTokenSpans(content, {}, {}),
    [content]
  );

  if (!open) return null;

  async function save() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!content.trim()) {
      setError("Message content is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        content,
        staticVars: initial?.staticVars ?? {},
        formatRules: initial?.formatRules ?? {},
      };
      const url = initial?.id ? `/api/templates/${initial.id}` : `/api/templates`;
      const method = initial?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      toast.success(initial?.id ? "Template updated" : "Template created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">
            {initial?.id ? "Edit template" : "Create template"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <Label htmlFor="t-name" className="block mb-1.5">Name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly dues reminder"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="t-desc" className="block mb-1.5">Description (optional)</Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note for your future self"
            />
          </div>
          <div>
            <Label className="block mb-1.5">Message</Label>
            <TokenTextarea
              value={content}
              onChange={setContent}
              spans={spans}
              placeholder="Hello {{Name}}, your balance is {{Balance}}…"
              maxLength={4096}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Use <code>{`{{Variable Name}}`}</code> placeholders. Templates are
              column-agnostic — when you load this in a campaign, the wizard
              tries to match tokens against your file&apos;s columns and lets you
              fill in the rest.
            </p>
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {initial?.id ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
