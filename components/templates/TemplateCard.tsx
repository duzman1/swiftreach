"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Trash2, Copy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface TemplateRecord {
  id: string;
  name: string;
  description: string | null;
  content: string;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
}

interface Props {
  template: TemplateRecord;
  onEdit: (t: TemplateRecord) => void;
  onChanged: () => void;
}

function extractTokens(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of content.matchAll(/\{\{([^}]+)\}\}/g)) {
    const t = m[1].trim();
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function TemplateCard({ template, onEdit, onChanged }: Props) {
  const [busy, setBusy] = React.useState(false);
  const tokens = React.useMemo(() => extractTokens(template.content), [template.content]);

  async function remove() {
    if (!confirm(`Delete template "${template.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Delete failed");
        return;
      }
      toast.success("Template deleted");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${template.name} (copy)`,
          description: template.description ?? "",
          content: template.content,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Copy failed");
        return;
      }
      toast.success("Template duplicated");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base truncate">{template.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {template.description || "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        <p className="text-muted-foreground line-clamp-3 text-xs whitespace-pre-wrap">
          {template.content.slice(0, 180)}
          {template.content.length > 180 ? "…" : ""}
        </p>

        {tokens.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tokens.slice(0, 6).map((t) => (
              <code
                key={t}
                className="text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5"
              >
                {`{{${t}}}`}
              </code>
            ))}
            {tokens.length > 6 && (
              <span className="text-[10px] text-muted-foreground">+{tokens.length - 6} more</span>
            )}
          </div>
        )}

        <div className="text-[11px] text-muted-foreground">
          Used {template.usageCount} time{template.usageCount === 1 ? "" : "s"}
          {template.lastUsedAt && ` · last ${new Date(template.lastUsedAt).toLocaleDateString()}`}
        </div>
      </CardContent>
      <div className="px-6 pb-4 flex items-center gap-2">
        <Link
          href={`/send?template=${template.id}`}
          className="text-sm font-medium text-whatsapp hover:underline"
        >
          Use in new campaign →
        </Link>
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(template)}
            disabled={busy}
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={duplicate}
            disabled={busy}
            aria-label="Duplicate"
            title="Duplicate"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={busy}
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </span>
      </div>
    </Card>
  );
}
