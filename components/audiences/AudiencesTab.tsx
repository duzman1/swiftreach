"use client";

// Third tab on the Contacts page — dynamic audience management.
// Growth+ only. Below Growth the parent renders a locked banner
// instead of this component (see the tab-body switch in
// app/(app)/contacts/page.tsx).
//
// Ships with a rule editor: pick field + operator + value per row,
// live count updates via debounced /api/audiences/preview call.

import * as React from "react";
import { toast } from "sonner";
import { Plus, X, Loader2, Trash2, Copy, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AudienceRow {
  id: string;
  name: string;
  description: string | null;
  rules: string; // raw JSON string
  memberCount: number | null;
  rulesError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
}

interface Client {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

// The rule shape used in-memory by the editor. Matches the server
// grammar but keeps `value` as a string for form-input simplicity;
// serialization to the server shape happens in serialize().
interface EditorPredicate {
  field: string;            // "group" | "client" | "optedOut" | "data.<key>"
  op: string;               // matches audienceResolver Operator
  // Wire-shape values. Group uses value_multi (array of ids);
  // optedOut uses value_bool; everything else uses value_str.
  value_str?: string;
  value_bool?: boolean;
  value_multi?: string[];
}

const FIELD_OPTIONS = [
  { value: "group",    label: "Group" },
  { value: "client",   label: "Client" },
  { value: "optedOut", label: "Opt-out status" },
  { value: "data",     label: "Custom field (data.…)" }, // triggers key input
];

const OPS_BY_FIELD: Record<string, { value: string; label: string; needsValue: boolean }[]> = {
  group: [
    { value: "in", label: "is in", needsValue: true },
  ],
  client: [
    { value: "equals",       label: "is",           needsValue: true },
    { value: "not_equals",   label: "is not",       needsValue: true },
    { value: "is_empty",     label: "is unassigned", needsValue: false },
    { value: "is_not_empty", label: "is any client", needsValue: false },
  ],
  optedOut: [
    { value: "equals", label: "is", needsValue: true }, // value: true/false
  ],
  data: [
    { value: "equals",       label: "equals",         needsValue: true },
    { value: "not_equals",   label: "does not equal", needsValue: true },
    { value: "contains",     label: "contains",       needsValue: true },
    { value: "greater_than", label: "greater than",   needsValue: true },
    { value: "less_than",    label: "less than",      needsValue: true },
    { value: "is_empty",     label: "is empty",       needsValue: false },
    { value: "is_not_empty", label: "is not empty",   needsValue: false },
  ],
};

function emptyPredicate(): EditorPredicate {
  return { field: "group", op: "in", value_multi: [] };
}

export function AudiencesTab() {
  const [audiences, setAudiences] = React.useState<AudienceRow[] | null>(null);
  const [limit, setLimit] = React.useState(50);
  const [loading, setLoading] = React.useState(true);
  const [locked, setLocked] = React.useState(false);
  const [editing, setEditing] = React.useState<AudienceRow | "new" | null>(null);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/audiences");
      // 403 with upgradeRequired means the plan doesn't include
      // savedAudiences — render the locked banner instead of a
      // generic toast. Every audiences endpoint is gated identically,
      // so once list is 403 all writes will be too.
      if (r.status === 403) {
        setLocked(true);
        setAudiences([]);
        return;
      }
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Failed"); return; }
      setAudiences(j.audiences);
      setLimit(j.limit ?? 50);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    fetch("/api/contacts/groups").then((r) => r.json()).then((j) => {
      if (j.ok) setGroups(j.groups);
    }).catch(() => {});
    fetch("/api/clients").then((r) => r.json()).then((j) => {
      if (j.ok) setClients(j.clients);
    }).catch(() => {});
  }, []);

  async function onDelete(a: AudienceRow) {
    if (!confirm(`Delete audience "${a.name}"? Scheduled campaigns using it will fail on the next fire.`)) return;
    try {
      const r = await fetch(`/api/audiences/${a.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Delete failed"); return; }
      toast.success("Audience deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    }
  }

  async function onDuplicate(a: AudienceRow) {
    try {
      const r = await fetch("/api/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${a.name} (copy)`,
          description: a.description,
          rules: JSON.parse(a.rules),
        }),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Duplicate failed"); return; }
      toast.success("Duplicated");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    }
  }

  const atLimit = (audiences?.length ?? 0) >= limit;

  if (locked) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-center space-y-2">
        <div className="text-sm font-medium text-amber-900">
          Saved audiences are a Growth plan feature.
        </div>
        <p className="text-xs text-amber-800 max-w-md mx-auto">
          Build rule-based lists (e.g. &ldquo;in Lagos VIPs and opted in&rdquo;)
          that stay current as your contacts change. Upgrade to Growth to
          create audiences and use them in campaigns.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {audiences?.length ?? 0} of {limit} audiences used
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setEditing("new")}
          disabled={atLimit}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New audience
        </Button>
      </div>

      {loading && !audiences ? (
        <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
      ) : audiences && audiences.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 py-10 text-center text-sm text-muted-foreground">
          No audiences yet. Create one to target contacts by rules —
          the audience stays current as your contact set changes.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
          {audiences?.map((a) => (
            <li key={a.id} className="p-4 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 truncate">{a.name}</div>
                {a.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {a.description}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {a.rulesError ? (
                    <span className="text-red-600">Rules invalid — edit to fix</span>
                  ) : a.memberCount === null ? (
                    <span>counting…</span>
                  ) : (
                    <span>
                      {a.memberCount.toLocaleString()} contact
                      {a.memberCount === 1 ? "" : "s"} match today
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setEditing(a)} title="Edit" className="h-8 w-8 p-0">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDuplicate(a)} title="Duplicate" className="h-8 w-8 p-0">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(a)} title="Delete" className="h-8 w-8 p-0 text-red-600">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {atLimit && (
        <div className="text-xs text-amber-800">
          Reached the {limit}-audience cap. Delete an unused one to add another.
        </div>
      )}

      {editing && (
        <AudienceEditor
          initial={editing === "new" ? null : editing}
          groups={groups}
          clients={clients.filter((c) => !c.archived)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Editor modal ──────────────────────────────────────────────────

interface EditorProps {
  initial: AudienceRow | null;
  groups: Group[];
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}

function AudienceEditor({ initial, groups, clients, onClose, onSaved }: EditorProps) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [predicates, setPredicates] = React.useState<EditorPredicate[]>(
    initial ? loadPredicates(initial.rules) : [emptyPredicate()]
  );
  const [saving, setSaving] = React.useState(false);
  // Preview state, debounced against rule edits.
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewSample, setPreviewSample] = React.useState<Array<{ id: string; phoneNumber: string }>>([]);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // Debounced preview fetch. 400ms lag is comfortable for typing +
  // matches how the wizard filter feels; server-side rate limit
  // still caps abuse.
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const rules = serialize(predicates);
        if (!rules) {
          setPreviewCount(null);
          setPreviewSample([]);
          setPreviewError("Add at least one rule");
          return;
        }
        const r = await fetch("/api/audiences/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules }),
        });
        const j = await r.json();
        if (!j.ok) {
          setPreviewError(j.error ?? "Preview failed");
          setPreviewCount(null);
          return;
        }
        setPreviewCount(j.count);
        setPreviewSample(j.sample ?? []);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Network error");
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predicates]);

  function updatePredicate(idx: number, next: EditorPredicate) {
    setPredicates((prev) => prev.map((p, i) => (i === idx ? next : p)));
  }
  function removePredicate(idx: number) {
    setPredicates((prev) => prev.filter((_, i) => i !== idx));
  }
  function addPredicate() {
    setPredicates((prev) => [...prev, emptyPredicate()]);
  }

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const rules = serialize(predicates);
    if (!rules) { toast.error("Add at least one rule before saving"); return; }
    setSaving(true);
    try {
      const url = initial ? `/api/audiences/${initial.id}` : "/api/audiences";
      const method = initial ? "PUT" : "POST";
      const body = initial
        ? { name: name.trim(), description: description.trim() || null, rules }
        : { name: name.trim(), description: description.trim() || null, rules };
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Save failed"); return; }
      toast.success(initial ? "Audience updated" : "Audience created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {initial ? "Edit audience" : "New audience"}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="a-name" className="block mb-1.5">Name</Label>
            <Input id="a-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lagos VIPs" />
          </div>
          <div>
            <Label htmlFor="a-desc" className="block mb-1.5">Description (optional)</Label>
            <Input id="a-desc" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label>Rules (all must match — AND)</Label>
            <Button size="sm" variant="ghost" onClick={addPredicate} className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              Add rule
            </Button>
          </div>
          {predicates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add at least one rule. An empty rule set can&apos;t be saved.
            </p>
          )}
          {predicates.map((p, i) => (
            <PredicateRow
              key={i}
              predicate={p}
              groups={groups}
              clients={clients}
              onChange={(next) => updatePredicate(i, next)}
              onRemove={() => removePredicate(i)}
            />
          ))}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-2">
          <div className="text-xs text-zinc-600 flex items-center gap-2">
            {previewLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            {previewError ? (
              <span className="text-red-600">{previewError}</span>
            ) : previewCount === null ? (
              <span>Live preview…</span>
            ) : (
              <span>
                <strong className="text-zinc-900">{previewCount.toLocaleString()}</strong>{" "}
                contact{previewCount === 1 ? "" : "s"} match right now (excludes opt-outs)
              </span>
            )}
          </div>
          {previewSample.length > 0 && (
            <ul className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {previewSample.map((c) => (
                <li key={c.id} className="font-mono truncate">+{c.phoneNumber}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? "Save changes" : "Create audience"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Single rule row ──────────────────────────────────────────────

function PredicateRow({
  predicate,
  groups,
  clients,
  onChange,
  onRemove,
}: {
  predicate: EditorPredicate;
  groups: Group[];
  clients: Client[];
  onChange: (next: EditorPredicate) => void;
  onRemove: () => void;
}) {
  // A data.<key> field is stored as field="data.<key>"; the row's
  // dropdown shows "Custom field" and reveals a key input.
  const isDataField = predicate.field.startsWith("data.");
  const fieldKind = isDataField ? "data" : predicate.field;
  const dataKey = isDataField ? predicate.field.slice(5) : "";
  const ops = OPS_BY_FIELD[fieldKind] ?? [];
  const opConfig = ops.find((o) => o.value === predicate.op);
  const needsValue = opConfig?.needsValue ?? true;

  function changeField(next: string) {
    // Reset op + value to sensible defaults for the new field.
    if (next === "group")    onChange({ field: "group", op: "in", value_multi: [] });
    else if (next === "client")   onChange({ field: "client", op: "equals", value_str: "" });
    else if (next === "optedOut") onChange({ field: "optedOut", op: "equals", value_bool: false });
    else if (next === "data")     onChange({ field: "data.", op: "equals", value_str: "" });
  }
  function changeDataKey(k: string) {
    onChange({ ...predicate, field: `data.${k}` });
  }
  function changeOp(op: string) {
    onChange({ ...predicate, op });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2 flex items-center gap-2 flex-wrap">
      <select
        value={fieldKind}
        onChange={(e) => changeField(e.target.value)}
        className="h-9 px-2 rounded-md border border-zinc-300 text-sm bg-white"
      >
        {FIELD_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      {fieldKind === "data" && (
        <Input
          value={dataKey}
          onChange={(e) => changeDataKey(e.target.value)}
          placeholder="field name (e.g. City)"
          className="h-9 w-40 text-sm"
        />
      )}
      <select
        value={predicate.op}
        onChange={(e) => changeOp(e.target.value)}
        className="h-9 px-2 rounded-md border border-zinc-300 text-sm bg-white"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {needsValue && fieldKind === "group" && (
        <select
          multiple
          value={predicate.value_multi ?? []}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...predicate, value_multi: vals });
          }}
          className="h-24 min-w-[160px] px-2 rounded-md border border-zinc-300 text-sm bg-white"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}

      {needsValue && fieldKind === "client" && (
        <select
          value={predicate.value_str ?? ""}
          onChange={(e) => onChange({ ...predicate, value_str: e.target.value })}
          className="h-9 px-2 rounded-md border border-zinc-300 text-sm bg-white min-w-[160px]"
        >
          <option value="">— pick client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {needsValue && fieldKind === "optedOut" && (
        <select
          value={predicate.value_bool ? "true" : "false"}
          onChange={(e) => onChange({ ...predicate, value_bool: e.target.value === "true" })}
          className="h-9 px-2 rounded-md border border-zinc-300 text-sm bg-white"
        >
          <option value="false">opted in</option>
          <option value="true">opted out</option>
        </select>
      )}

      {needsValue && fieldKind === "data" && (
        <Input
          value={predicate.value_str ?? ""}
          onChange={(e) => onChange({ ...predicate, value_str: e.target.value })}
          placeholder="value"
          className="h-9 w-40 text-sm"
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto p-1.5 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50"
        title="Remove rule"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Serialization ────────────────────────────────────────────────

/** Serialize the editor's predicate array to the server rule shape.
 *  Returns null if the set is empty OR any predicate is invalid
 *  (missing value where required, missing data key, empty group set).
 *  The API rejects the same shape server-side; this is the client
 *  guard so the Save button doesn't fire on nonsense. */
function serialize(preds: EditorPredicate[]): { op: "AND"; predicates: any[] } | null {
  if (preds.length === 0) return null;
  const out: any[] = [];
  for (const p of preds) {
    if (p.field === "data.") return null; // missing data key
    if (p.field === "group" && p.op === "in") {
      if (!p.value_multi || p.value_multi.length === 0) return null;
      out.push({ field: "group", op: "in", value: p.value_multi });
      continue;
    }
    if (p.field === "optedOut" && p.op === "equals") {
      out.push({ field: "optedOut", op: "equals", value: !!p.value_bool });
      continue;
    }
    if (p.op === "is_empty" || p.op === "is_not_empty") {
      out.push({ field: p.field, op: p.op });
      continue;
    }
    const v = (p.value_str ?? "").trim();
    if (!v) return null;
    out.push({ field: p.field, op: p.op, value: v });
  }
  return { op: "AND", predicates: out };
}

/** Hydrate stored server JSON into the editor's shape. Best-effort;
 *  if the stored blob is malformed the editor starts empty. */
function loadPredicates(rulesJson: string): EditorPredicate[] {
  try {
    const parsed = JSON.parse(rulesJson);
    const list: EditorPredicate[] = [];
    for (const p of parsed.predicates ?? []) {
      if (p.field === "group") {
        list.push({ field: "group", op: "in", value_multi: p.value ?? [] });
      } else if (p.field === "optedOut") {
        list.push({ field: "optedOut", op: "equals", value_bool: !!p.value });
      } else if (p.op === "is_empty" || p.op === "is_not_empty") {
        list.push({ field: p.field, op: p.op });
      } else {
        list.push({ field: p.field, op: p.op, value_str: String(p.value ?? "") });
      }
    }
    return list.length > 0 ? list : [emptyPredicate()];
  } catch {
    return [emptyPredicate()];
  }
}
