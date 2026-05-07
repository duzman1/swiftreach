"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TemplateCard, type TemplateRecord } from "./TemplateCard";
import { TemplateEditor } from "./TemplateEditor";
import { toast } from "sonner";

export function TemplatesView() {
  const [templates, setTemplates] = React.useState<TemplateRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TemplateRecord | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.ok) setTemplates(data.templates);
      else toast.error(data.error ?? "Failed to load templates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function startEdit(t: TemplateRecord) {
    setEditing(t);
    setEditorOpen(true);
  }
  function onSaved() {
    setEditorOpen(false);
    void load();
  }

  const filtered = templates.filter((t) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(lower) ||
      (t.description ?? "").toLowerCase().includes(lower) ||
      t.content.toLowerCase().includes(lower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name, description, or content…"
            className="pl-10"
          />
        </div>
        <Button onClick={startCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Template
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Loading templates…
        </p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {templates.length === 0 ? "No templates yet" : "No matches"}
            </CardTitle>
            <CardDescription>
              {templates.length === 0 ? (
                <>
                  Save messages as templates to reuse them across campaigns.
                  Templates are column-agnostic — load them with any contact
                  file and the variable system reconciles automatically.
                </>
              ) : (
                "Try a different search query."
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={startEdit}
              onChanged={load}
            />
          ))}
        </div>
      )}

      <TemplateEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={onSaved}
      />
    </div>
  );
}
