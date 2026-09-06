"use client";

// Contact Book — All Contacts + Groups tabs. Search/filter on the list,
// per-row actions (edit, opt-out toggle, delete), bulk delete, group
// rename. Imports flow from the campaign wizard, not this page (the
// "Add Contact" button creates one row at a time).

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  ShieldOff,
  ShieldCheck,
  FolderPlus,
  Send,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradePrompt } from "@/components/shared/UpgradePrompt";
import { ClientFilter, ClientChip } from "@/components/clients/ClientFilter";

interface Contact {
  id: string;
  phoneNumber: string;
  data: string; // JSON
  groupIds: string; // JSON array
  optedOut: boolean;
  optedOutAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientId?: string | null;
  client?: { id: string; name: string; color: string | null } | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  contactCount: number;
}

type Tab = "contacts" | "groups";

export default function ContactsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const clientId = search.get("clientId") ?? "";
  const [tab, setTab] = useState<Tab>("contacts");
  const [groups, setGroups] = useState<Group[] | null>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "opted_out">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [groupModal, setGroupModal] = useState<{ mode: "create" | "edit"; group?: Group } | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  async function loadGroups() {
    try {
      const r = await fetch("/api/contacts/groups");
      const j = await r.json();
      if (r.status === 403 && j.upgradeRequired) {
        setUpgradeRequired(true);
        return;
      }
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setGroups(j.groups);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load groups");
    }
  }

  async function loadContacts() {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (groupFilter) sp.set("groupId", groupFilter);
      if (statusFilter) sp.set("status", statusFilter);
      if (clientId) sp.set("clientId", clientId);
      sp.set("page", String(page));
      const r = await fetch(`/api/contacts?${sp.toString()}`);
      const j = await r.json();
      if (r.status === 403 && j.upgradeRequired) {
        setUpgradeRequired(true);
        return;
      }
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setContacts(j.contacts);
      setTotalPages(j.totalPages);
      setTotal(j.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (tab === "contacts") {
      loadContacts();
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, groupFilter, statusFilter, clientId]);

  // Debounced search
  useEffect(() => {
    if (tab !== "contacts") return;
    const t = setTimeout(() => {
      setPage(1);
      loadContacts();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function deleteContact(c: Contact) {
    if (!confirm(`Delete ${c.phoneNumber}?`)) return;
    try {
      const r = await fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Deleted");
      loadContacts();
      loadGroups();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} contact(s)? This is irreversible.`)) return;
    try {
      await Promise.all(
        Array.from(selected).map((id) => fetch(`/api/contacts/${id}`, { method: "DELETE" }))
      );
      toast.success(`Deleted ${selected.size}`);
      setSelected(new Set());
      loadContacts();
      loadGroups();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function toggleOptOut(c: Contact) {
    const next = !c.optedOut;
    if (next && !confirm(`Mark ${c.phoneNumber} as opted out? They won't receive future messages.`)) return;
    if (!next && !confirm(`Re-opt-in ${c.phoneNumber}? Re-engaging an opted-out contact may violate WhatsApp policy unless they've explicitly asked to be added back.`)) return;
    try {
      const r = await fetch(`/api/contacts/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optedOut: next }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(next ? "Marked opted out" : "Re-opted in");
      loadContacts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function exportCsv() {
    try {
      const r = await fetch("/api/contacts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, groupId: groupFilter, status: statusFilter }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? "Export failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  function toggleAllOnPage() {
    if (!contacts) return;
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (upgradeRequired) {
    return (
      <div className="space-y-6">
        <header className="max-w-6xl">
          <h1 className="text-3xl font-bold tracking-tight">Contact Book</h1>
          <p className="text-muted-foreground mt-1">
            Save contacts once, reuse them across campaigns.
          </p>
        </header>
        <UpgradePrompt
          feature="Contact Book"
          description="Save your contacts permanently — pick from your saved list or a group when sending a campaign, instead of re-uploading the same CSV every time."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Book</h1>
          <p className="text-muted-foreground mt-1">
            Save contacts once, reuse them across campaigns. Mark contacts opted out
            to suppress future sends.
          </p>
        </div>
        {tab === "contacts" && <ClientFilter />}
      </header>

      <div className="border-b flex gap-6">
        <button
          onClick={() => setTab("contacts")}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "contacts"
              ? "border-whatsapp text-whatsapp"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Contacts {total > 0 && `(${total.toLocaleString()})`}
        </button>
        <button
          onClick={() => setTab("groups")}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "groups"
              ? "border-whatsapp text-whatsapp"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Groups {groups && groups.length > 0 && `(${groups.length})`}
        </button>
      </div>

      {tab === "contacts" ? (
        <>
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-[1fr,auto,auto,auto] gap-3 items-end">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search phone or any saved field"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input px-3 text-sm bg-background"
              >
                <option value="">All groups</option>
                {(groups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "" | "active" | "opted_out");
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input px-3 text-sm bg-background"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="opted_out">Opted out</option>
              </select>
              <div className="flex gap-2">
                <Button onClick={() => setAddOpen(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
                <Button variant="outline" onClick={exportCsv} className="gap-1.5">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {selected.size > 0 && (
            <div className="rounded-md border bg-zinc-50 px-4 py-2 flex items-center justify-between text-sm">
              <span>{selected.size} selected</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" variant="outline" onClick={bulkDelete} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={contacts ? selected.size === contacts.length && contacts.length > 0 : false}
                        onChange={toggleAllOnPage}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Fields</th>
                    <th className="px-4 py-3 text-left">Groups</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && !contacts && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {contacts && contacts.length === 0 && !loading && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No contacts yet — click &quot;Add Contact&quot; or import from a campaign.</td></tr>
                  )}
                  {contacts?.map((c) => (
                    <ContactRow
                      key={c.id}
                      c={c}
                      groups={groups ?? []}
                      selected={selected.has(c.id)}
                      onToggle={() => toggleOne(c.id)}
                      onEdit={() => setEditing(c)}
                      onDelete={() => deleteContact(c)}
                      onToggleOptOut={() => toggleOptOut(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total.toLocaleString()} contacts
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-md hover:bg-zinc-200 disabled:opacity-30"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-md hover:bg-zinc-200 disabled:opacity-30"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      ) : (
        <GroupsTab
          groups={groups}
          onChanged={() => {
            loadGroups();
          }}
          onUseInCampaign={(g) => router.push(`/send?group=${g.id}`)}
          onEdit={(g) => setGroupModal({ mode: "edit", group: g })}
          onCreate={() => setGroupModal({ mode: "create" })}
        />
      )}

      {addOpen && (
        <ContactModal
          mode="create"
          groups={groups ?? []}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            loadContacts();
            loadGroups();
          }}
        />
      )}

      {editing && (
        <ContactModal
          mode="edit"
          contact={editing}
          groups={groups ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadContacts();
            loadGroups();
          }}
        />
      )}

      {groupModal && (
        <GroupModal
          mode={groupModal.mode}
          group={groupModal.group}
          onClose={() => setGroupModal(null)}
          onSaved={() => {
            setGroupModal(null);
            loadGroups();
          }}
        />
      )}
    </div>
  );
}

function ContactRow({
  c,
  groups,
  selected,
  onToggle,
  onEdit,
  onDelete,
  onToggleOptOut,
}: {
  c: Contact;
  groups: Group[];
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleOptOut: () => void;
}) {
  const data = useMemo<Record<string, string>>(() => {
    try {
      return JSON.parse(c.data || "{}");
    } catch {
      return {};
    }
  }, [c.data]);
  const groupIds = useMemo<string[]>(() => {
    try {
      return JSON.parse(c.groupIds || "[]");
    } catch {
      return [];
    }
  }, [c.groupIds]);

  const fieldsPreview = Object.entries(data)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-4 py-2 font-mono text-xs">+{c.phoneNumber}</td>
      <td className="px-4 py-2 text-xs text-muted-foreground max-w-md truncate">
        {fieldsPreview || <span className="opacity-50">No fields</span>}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1 items-center">
          {c.client && <ClientChip client={c.client} />}
          {groupIds.map((gid) => {
            const g = groups.find((x) => x.id === gid);
            if (!g) return null;
            return (
              <span
                key={gid}
                className="inline-block px-1.5 py-0.5 text-[10px] rounded text-white"
                style={{ background: g.color }}
              >
                {g.name}
              </span>
            );
          })}
          {!c.client && groupIds.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2">
        {c.optedOut ? (
          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
            Opted Out
          </span>
        ) : (
          <span className="text-xs text-emerald-700">Active</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <button onClick={onEdit} className="p-1 rounded hover:bg-zinc-200" aria-label="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggleOptOut} className="p-1 rounded hover:bg-zinc-200" aria-label="Toggle opt-out">
            {c.optedOut ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ShieldOff className="w-3.5 h-3.5 text-amber-600" />
            )}
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-zinc-200 text-red-600" aria-label="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function GroupsTab({
  groups,
  onChanged,
  onUseInCampaign,
  onEdit,
  onCreate,
}: {
  groups: Group[] | null;
  onChanged: () => void;
  onUseInCampaign: (g: Group) => void;
  onEdit: (g: Group) => void;
  onCreate: () => void;
}) {
  async function deleteGroup(g: Group) {
    if (!confirm(`Delete group "${g.name}"? Contacts stay; only the group tag is removed.`)) return;
    try {
      const r = await fetch(`/api/contacts/groups/${g.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Group deleted");
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <div className="space-y-4">
      <div>
        <Button onClick={onCreate} className="gap-1.5">
          <FolderPlus className="w-4 h-4" />
          New Group
        </Button>
      </div>

      {!groups && <Card><CardContent className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</CardContent></Card>}

      {groups && groups.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No groups yet. Create one to organise your contacts (e.g. &quot;VIP&quot;, &quot;March Cohort&quot;).
          </CardContent>
        </Card>
      )}

      {groups && groups.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <div className="h-2" style={{ background: g.color }} />
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{g.name}</CardTitle>
                <CardDescription>
                  {g.contactCount.toLocaleString()} contact{g.contactCount === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                <div className="flex items-center gap-1 pt-2">
                  <Button size="sm" variant="outline" onClick={() => onUseInCampaign(g)} className="gap-1">
                    <Send className="w-3 h-3" />
                    Use in Campaign
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(g)} className="gap-1">
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteGroup(g)} className="text-red-600 ml-auto">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────

function ContactModal({
  mode,
  contact,
  groups,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  contact?: Contact;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo<Record<string, string>>(() => {
    if (!contact) return {};
    try { return JSON.parse(contact.data || "{}"); } catch { return {}; }
  }, [contact]);
  const initialGroups = useMemo<string[]>(() => {
    if (!contact) return [];
    try { return JSON.parse(contact.groupIds || "[]"); } catch { return []; }
  }, [contact]);

  const [phone, setPhone] = useState(contact?.phoneNumber ?? "");
  const [fields, setFields] = useState<Array<{ key: string; value: string }>>(
    Object.entries(initial).map(([k, v]) => ({ key: k, value: String(v) }))
  );
  const [pickedGroups, setPickedGroups] = useState<string[]>(initialGroups);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields((f) => [...f, { key: "", value: "" }]);
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }
  function patchField(i: number, k: "key" | "value", v: string) {
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      for (const f of fields) {
        if (f.key.trim()) data[f.key.trim()] = f.value;
      }
      const url = mode === "create" ? "/api/contacts" : `/api/contacts/${contact!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body = mode === "create"
        ? { phoneNumber: phone, data, groupIds: pickedGroups }
        : { data, groupIds: pickedGroups };
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(mode === "create" ? "Added" : "Updated");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{mode === "create" ? "Add Contact" : "Edit Contact"}</h3>

        <div>
          <Label htmlFor="c-phone" className="block mb-1.5">Phone (E.164 format)</Label>
          <Input
            id="c-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555-123-4567"
            disabled={mode === "edit"}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fields</Label>
            <Button size="sm" variant="ghost" onClick={addField} className="gap-1">
              <Plus className="w-3.5 h-3.5" />
              Add field
            </Button>
          </div>
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">No saved fields yet — add Name, Email, etc.</p>
          )}
          {fields.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Field name"
                value={f.key}
                onChange={(e) => patchField(i, "key", e.target.value)}
                className="w-1/3"
              />
              <Input
                placeholder="Value"
                value={f.value}
                onChange={(e) => patchField(i, "value", e.target.value)}
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {groups.length > 0 && (
          <div>
            <Label className="block mb-1.5">Groups</Label>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = pickedGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() =>
                      setPickedGroups((p) =>
                        on ? p.filter((id) => id !== g.id) : [...p, g.id]
                      )
                    }
                    className={`px-2 py-1 text-xs rounded border ${on ? "text-white" : "text-foreground bg-background"}`}
                    style={on ? { background: g.color, borderColor: g.color } : {}}
                    type="button"
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || (mode === "create" && !phone.trim())} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupModal({
  mode,
  group,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  group?: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [color, setColor] = useState(group?.color ?? "#25D366");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = mode === "create" ? "/api/contacts/groups" : `/api/contacts/groups/${group!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description?.trim() || null, color }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(mode === "create" ? "Group created" : "Group updated");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{mode === "create" ? "New Group" : "Edit Group"}</h3>
        <div>
          <Label htmlFor="g-name" className="block mb-1.5">Name</Label>
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VIP, March Cohort"
          />
        </div>
        <div>
          <Label htmlFor="g-desc" className="block mb-1.5">Description (optional)</Label>
          <Input
            id="g-desc"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="g-color" className="block mb-1.5">Color</Label>
          <input
            id="g-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 rounded border"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
