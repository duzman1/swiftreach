"use client";

// Clients management card, sits under Settings alongside Branding.
// Editable only on Pro; below Pro the fields are disabled behind a
// lock banner, same pattern as BrandingForm. The daily-driver UX
// for clients is the FILTER on Analytics/Campaigns/Contacts — this
// page is only for the occasional add/rename/archive.

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Lock, Archive, ArchiveRestore, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Client {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
  contactCount: number;
  campaignCount: number;
}

interface Props {
  canEdit: boolean;
  plan: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#25D366";

export function ClientsManager({ canEdit, plan }: Props) {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [limit, setLimit] = React.useState<number>(50);
  const [creating, setCreating] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState<string>(DEFAULT_COLOR);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editColor, setEditColor] = React.useState<string>(DEFAULT_COLOR);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Client | null>(null);

  React.useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) {
          setClients(j.clients);
          setLimit(j.limit ?? 50);
        } else {
          toast.error(j.error ?? "Failed to load clients");
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [canEdit]);

  async function createOne() {
    const name = newName.trim();
    if (!name) return;
    if (newColor && !HEX_RE.test(newColor)) {
      toast.error("Color must be a 6-digit hex");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Create failed"); return; }
      setClients((prev) => [...prev, j.client].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      setShowAdd(false);
      toast.success("Client added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(c: Client) {
    setEditing(c.id);
    setEditName(c.name);
    setEditColor(c.color ?? DEFAULT_COLOR);
  }
  function cancelEdit() {
    setEditing(null);
  }
  async function saveEdit(c: Client) {
    if (editName.trim() === c.name && (editColor === (c.color ?? DEFAULT_COLOR))) {
      setEditing(null);
      return;
    }
    setBusyId(c.id);
    try {
      const r = await fetch(`/api/clients/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Save failed"); return; }
      setClients((prev) => prev.map((x) => (x.id === c.id ? j.client : x)));
      setEditing(null);
      toast.success("Client updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleArchive(c: Client) {
    setBusyId(c.id);
    try {
      const r = await fetch(`/api/clients/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !c.archived }),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Update failed"); return; }
      setClients((prev) => prev.map((x) => (x.id === c.id ? j.client : x)));
      toast.success(c.archived ? "Client unarchived" : "Client archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(c: Client) {
    setBusyId(c.id);
    try {
      const r = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Delete failed"); return; }
      setClients((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Client deleted — contacts and history retained");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  if (!canEdit) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <Lock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-900">
          <strong>Pro plan and above.</strong> Per-client reporting lets
          you tag contacts and campaigns by client, then filter analytics
          and PDF reports to a single client. You&apos;re on{" "}
          <span className="capitalize">{plan}</span>.{" "}
          <a href="/billing" className="underline font-medium">Upgrade to Pro</a>.
        </div>
      </div>
    );
  }

  const active = clients.filter((c) => !c.archived);
  const archived = clients.filter((c) => c.archived);
  const atLimit = clients.length >= limit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {clients.length} of {limit} labels used
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={atLimit || showAdd}
          onClick={() => setShowAdd(true)}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add client
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-zinc-700 block mb-1">Name</label>
            <input
              type="text"
              autoFocus
              value={newName}
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createOne(); if (e.key === "Escape") setShowAdd(false); }}
              className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm"
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700 block mb-1">Color</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-14 rounded border border-zinc-300 cursor-pointer"
            />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={createOne} disabled={creating || !newName.trim()} className="gap-1.5">
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-6">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 py-8 text-center text-sm text-muted-foreground">
          No clients yet. Add one to start labelling contacts and campaigns.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
          {[...active, ...archived].map((c) => {
            const isEditing = editing === c.id;
            return (
              <li key={c.id} className="p-3 flex items-center gap-3 flex-wrap">
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: c.color ?? DEFAULT_COLOR }}
                />
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      maxLength={80}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c); if (e.key === "Escape") cancelEdit(); }}
                      className="flex-1 min-w-[160px] h-8 px-2 rounded border border-zinc-300 text-sm"
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-8 w-10 rounded border border-zinc-300"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(c)} disabled={busyId === c.id} className="h-8 w-8 p-0">
                        {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4 text-emerald-600" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 w-8 p-0">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className={`flex-1 min-w-[160px] text-left text-sm font-medium truncate ${c.archived ? "text-zinc-400 line-through" : "text-zinc-900"} hover:text-whatsapp`}
                    >
                      {c.name}
                    </button>
                    <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {c.contactCount} contact{c.contactCount === 1 ? "" : "s"} · {c.campaignCount} campaign{c.campaignCount === 1 ? "" : "s"}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleArchive(c)}
                        disabled={busyId === c.id}
                        title={c.archived ? "Unarchive" : "Archive"}
                        className="h-8 w-8 p-0"
                      >
                        {c.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(c)}
                        disabled={busyId === c.id}
                        title="Delete"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {atLimit && !showAdd && (
        <div className="text-xs text-amber-800">
          Reached the {limit}-label cap. Archive an unused one or delete
          it (contact history is preserved) to add a new one.
        </div>
      )}

      {/* Delete confirm dialog — states plainly that history stays. */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-base font-semibold text-zinc-900">
              Delete &ldquo;{confirmDelete.name}&rdquo;?
            </h3>
            <p className="text-sm text-zinc-700">
              This removes the label. The{" "}
              <strong>{confirmDelete.contactCount} contact{confirmDelete.contactCount === 1 ? "" : "s"}</strong>
              {" "}and{" "}
              <strong>{confirmDelete.campaignCount} campaign{confirmDelete.campaignCount === 1 ? "" : "s"}</strong>
              {" "}currently labelled with it stay in your account — the label just clears. Message history is retained.
            </p>
            <p className="text-xs text-muted-foreground">
              Prefer <em>Archive</em> if you might reuse this label later.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => doDelete(confirmDelete)}
                disabled={busyId === confirmDelete.id}
                className="gap-1.5"
              >
                {busyId === confirmDelete.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete label
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
