"use client";

// Contact Book — All Contacts + Groups tabs. Search/filter on the list,
// per-row actions (edit, opt-out toggle, delete), bulk delete, group
// rename. Imports flow from the campaign wizard, not this page (the
// "Add Contact" button creates one row at a time).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  ShieldOff,
  ShieldCheck,
  FolderPlus,
  Send,
  Pencil,
  UserSquare2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradePrompt } from "@/components/shared/UpgradePrompt";
import { ClientFilter, ClientChip } from "@/components/clients/ClientFilter";
import { AudiencesTab } from "@/components/audiences/AudiencesTab";

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
  // Consent provenance — populated by the compliance layer.
  // consentStatus is always set (defaults to "unknown"); the rest may
  // be null when we don't have the fact recorded.
  consentStatus?: string;
  consentSource?: string | null;
  consentDate?: string | null;
  consentRecordedAt?: string | null;
  consentNote?: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  contactCount: number;
}

type Tab = "contacts" | "groups" | "audiences";

interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

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

  // Per-client label wiring. `clients === null` = not yet loaded /
  // below Pro (feature-gated 403). A non-null array means the user
  // has perClientReporting; the array itself may still be empty
  // (Pro user hasn't created any). Empty vs null matters for the UI:
  // Pro user with no clients still gets the bulk-bar dropdown
  // (offering only "Unassign"), non-Pro sees nothing at all.
  const [clients, setClients] = useState<ClientLite[] | null>(null);
  const canUseClients = clients !== null;
  const activeClients = (clients ?? []).filter((c) => !c.archived);
  // Bulk assign flow — pinned client id (or "unassigned") + confirm gate.
  const [bulkAssigning, setBulkAssigning] = useState(false);
  // Select-all-matching flow.
  const [selectingAll, setSelectingAll] = useState(false);

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
    // Fetch clients once on mount. A 403 here means the account
    // doesn't have perClientReporting — we quietly leave clients as
    // null and every downstream client-shaped control hides itself.
    (async () => {
      try {
        const r = await fetch("/api/clients");
        if (r.status === 403) return; // below Pro; no error toast
        const j = await r.json();
        if (j.ok) setClients(j.clients);
      } catch { /* silent — feature just stays hidden */ }
    })();
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

  /**
   * Bulk-assign the current selection to a client (or clear the
   * label if targetClientId === null). Reassigns even contacts that
   * already have a different label — the spec is explicit on this.
   * Confirmation states the count + the target so a fat-finger
   * doesn't silently relabel a hundred contacts.
   */
  async function bulkAssign(targetClientId: string | null) {
    if (selected.size === 0) return;
    const target = targetClientId
      ? activeClients.find((c) => c.id === targetClientId)
      : null;
    const targetLabel = targetClientId
      ? `to ${target?.name ?? "this client"}`
      : "as unassigned";
    if (!confirm(
      `${targetClientId ? "Assign" : "Unassign"} ${selected.size} contact${selected.size === 1 ? "" : "s"} ${targetLabel}? ` +
      `Contacts already labelled with another client will be reassigned.`
    )) return;
    setBulkAssigning(true);
    try {
      const r = await fetch("/api/contacts/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selected),
          clientId: targetClientId,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Assignment failed");
        return;
      }
      toast.success(
        targetClientId
          ? `Assigned ${j.updated} contact${j.updated === 1 ? "" : "s"} to ${target?.name ?? "client"}`
          : `Unassigned ${j.updated} contact${j.updated === 1 ? "" : "s"}`
      );
      setSelected(new Set());
      loadContacts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBulkAssigning(false);
    }
  }

  /**
   * "Select all N matching current filter" — a real select-all, not
   * just the loaded page. Fetches ids via the idsOnly=1 mode of the
   * contacts list route. If total exceeds the server's cap (500),
   * we still populate the selection with the returned first N and
   * surface the cap in a toast so the user isn't misled about which
   * contacts a subsequent bulk action will hit.
   */
  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (groupFilter) sp.set("groupId", groupFilter);
      if (statusFilter) sp.set("status", statusFilter);
      if (clientId) sp.set("clientId", clientId);
      sp.set("idsOnly", "1");
      const r = await fetch(`/api/contacts?${sp.toString()}`);
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Failed to select all");
        return;
      }
      setSelected(new Set(j.ids as string[]));
      if (j.capped) {
        toast(
          `Selected first ${j.ids.length} of ${j.total}. Bulk actions are capped at ${j.cap} per call — repeat on the next batch after this one clears.`
        );
      } else {
        toast.success(`Selected all ${j.ids.length} matching`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSelectingAll(false);
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
        <button
          onClick={() => setTab("audiences")}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "audiences"
              ? "border-whatsapp text-whatsapp"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Audiences
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
            <div className="rounded-md border bg-zinc-50 px-4 py-2 flex items-center justify-between text-sm flex-wrap gap-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span>{selected.size} selected</span>
                {/* When the user has more rows matching the filter
                    than are on the loaded page, offer a true
                    select-all — cheaper than paginating. Hidden when
                    the selection already equals the full match set. */}
                {total > (contacts?.length ?? 0) && selected.size < total && (
                  <button
                    type="button"
                    onClick={selectAllMatching}
                    disabled={selectingAll}
                    className="text-whatsapp hover:underline text-xs font-medium disabled:opacity-50"
                  >
                    {selectingAll
                      ? "Selecting…"
                      : `Select all ${total.toLocaleString()} matching current filter`}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                {/* Assign-to-client control — Pro only. Hidden when
                    the account doesn't have perClientReporting (the
                    /api/clients fetch 403'd on mount → clients=null). */}
                {canUseClients && (
                  <BulkAssignMenu
                    clients={activeClients}
                    disabled={bulkAssigning}
                    onAssign={bulkAssign}
                  />
                )}
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
                      {/* Checkbox toggles only the CURRENT PAGE
                          (up to PAGE_SIZE=50). The bulk bar's
                          "Select all N matching" link is the way to
                          reach the full match set — this checkbox
                          alone would silently mislead when a filter
                          matches more than one page. */}
                      <input
                        type="checkbox"
                        title="Select all on this page"
                        aria-label={`Select all ${contacts?.length ?? 0} on this page`}
                        checked={contacts ? selected.size >= contacts.length && contacts.length > 0 : false}
                        onChange={toggleAllOnPage}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Fields</th>
                    <th className="px-4 py-3 text-left">Groups</th>
                    {canUseClients && <th className="px-4 py-3 text-left">Client</th>}
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && !contacts && (
                    <tr><td colSpan={canUseClients ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {contacts && contacts.length === 0 && !loading && (
                    <tr><td colSpan={canUseClients ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">No contacts yet — click &quot;Add Contact&quot; or import from a campaign.</td></tr>
                  )}
                  {contacts?.map((c) => (
                    <ContactRow
                      key={c.id}
                      c={c}
                      groups={groups ?? []}
                      showClientColumn={canUseClients}
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
      ) : tab === "groups" ? (
        <GroupsTab
          groups={groups}
          onChanged={() => {
            loadGroups();
          }}
          onUseInCampaign={(g) => router.push(`/send?group=${g.id}`)}
          onEdit={(g) => setGroupModal({ mode: "edit", group: g })}
          onCreate={() => setGroupModal({ mode: "create" })}
        />
      ) : (
        <AudiencesTab />
      )}

      {addOpen && (
        <ContactModal
          mode="create"
          groups={groups ?? []}
          clients={canUseClients ? activeClients : null}
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
          clients={canUseClients ? activeClients : null}
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
  showClientColumn,
  selected,
  onToggle,
  onEdit,
  onDelete,
  onToggleOptOut,
}: {
  c: Contact;
  groups: Group[];
  showClientColumn: boolean;
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
          {groupIds.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>
      {showClientColumn && (
        <td className="px-4 py-2">
          {c.client ? (
            <ClientChip client={c.client} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1 items-start">
          {c.optedOut ? (
            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
              Opted Out
            </span>
          ) : (
            <span className="text-xs text-emerald-700">Active</span>
          )}
          {/* Unverified-consent pill. Shows on any contact whose
              consent basis wasn't captured — a truthful "we don't
              know" indicator, not a block. Clicking Edit lets the
              user promote the status. */}
          {(c.consentStatus ?? "unknown") === "unknown" && (
            <span
              className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800"
              title="Consent basis is unrecorded. Click Edit to set it."
            >
              Unverified consent
            </span>
          )}
        </div>
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
  clients,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  contact?: Contact;
  groups: Group[];
  /** Non-archived clients for the label selector. `null` = feature
   *  not available on this account (below Pro) → selector is hidden. */
  clients: ClientLite[] | null;
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
  // "" here = Unassigned. Only used when the account has clients
  // enabled; when clients is null this state is inert.
  const [pickedClientId, setPickedClientId] = useState<string>(contact?.clientId ?? "");
  const [saving, setSaving] = useState(false);

  // ── Consent capture ────────────────────────────────────────────────
  // consentStatus defaults to "explicit" on the create form — a user
  // manually adding one contact almost always has a real basis for
  // it (they wouldn't be doing it otherwise). If they don't fill in
  // the source, the row still counts as "explicit" — the source is
  // optional-but-prompted; leaving it blank doesn't invalidate the
  // status the user chose, it just leaves the source unknown. For
  // edit, we start from what's in the DB so existing "unknown" rows
  // stay unknown unless the user explicitly promotes them.
  const [consentStatus, setConsentStatus] = useState<string>(
    contact?.consentStatus ?? (mode === "create" ? "explicit" : "unknown")
  );
  const [consentSource, setConsentSource] = useState<string>(contact?.consentSource ?? "");
  const [consentDate, setConsentDate] = useState<string>(
    contact?.consentDate ? contact.consentDate.slice(0, 10) : ""
  );
  const [consentNote, setConsentNote] = useState<string>(contact?.consentNote ?? "");

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
      // Only send clientId when the account has clients enabled AND
      // the value changed from the initial. "" → null (Unassigned).
      const clientFieldPatch =
        clients !== null && pickedClientId !== (contact?.clientId ?? "")
          ? { clientId: pickedClientId || null }
          : {};
      // Consent payload. Send only what changed on edit — sending
      // status:"explicit" on an untouched edit would silently promote
      // an unknown row, which is exactly what rule 1 forbids. So
      // include consent fields on create always, but on edit only
      // when the user actually touched them (checked by comparing
      // against the original values from the loaded contact).
      const consentChanged =
        mode === "create" ||
        consentStatus !== (contact?.consentStatus ?? "unknown") ||
        consentSource !== (contact?.consentSource ?? "") ||
        consentDate !== (contact?.consentDate ? contact.consentDate.slice(0, 10) : "") ||
        consentNote !== (contact?.consentNote ?? "");
      const consentPatch = consentChanged
        ? {
            consentStatus,
            consentSource: consentSource.trim() || null,
            consentDate: consentDate ? `${consentDate}T00:00:00.000Z` : null,
            consentNote: consentNote.trim() || null,
          }
        : {};
      const body = mode === "create"
        ? { phoneNumber: phone, data, groupIds: pickedGroups, ...clientFieldPatch, ...consentPatch }
        : { data, groupIds: pickedGroups, ...clientFieldPatch, ...consentPatch };
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

        {/* Client selector — shown only when the account has
            perClientReporting. "" = Unassigned; server treats
            missing/null identically. */}
        {clients !== null && (
          <div>
            <Label htmlFor="c-client" className="block mb-1.5">Client</Label>
            <select
              id="c-client"
              value={pickedClientId}
              onChange={(e) => setPickedClientId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-zinc-300 bg-white text-sm"
            >
              <option value="">— Unassigned —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

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

        {/* Consent capture — the compliance layer's evidence field.
            Prompted but not required (the wizard doesn't block save
            on missing source/date), because forcing it would either
            train users to lie or make them abandon adds — both worse
            than a truthful "unknown". */}
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-3">
          <div>
            <Label htmlFor="c-consent-status" className="block mb-1.5">
              How did they consent to messages?
            </Label>
            <select
              id="c-consent-status"
              value={consentStatus}
              onChange={(e) => setConsentStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-zinc-300 bg-white text-sm"
            >
              <option value="explicit">Explicit — they opted in directly (form, verbal, WhatsApp reply)</option>
              <option value="imported">Imported — moved over from another list where they had opted in</option>
              <option value="unknown">Unknown — I don&apos;t have a clear record</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              This shows on the contact so future you (or a teammate) can see
              where consent came from. &ldquo;Unknown&rdquo; is fine — it&apos;s
              honest, and the contact still receives messages; they just get
              flagged as unverified on the compliance dashboard.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-consent-source" className="block mb-1.5">Source (optional)</Label>
              <Input
                id="c-consent-source"
                value={consentSource}
                onChange={(e) => setConsentSource(e.target.value)}
                placeholder="e.g. Signup form on website"
              />
            </div>
            <div>
              <Label htmlFor="c-consent-date" className="block mb-1.5">Date consent given (optional)</Label>
              <Input
                id="c-consent-date"
                type="date"
                value={consentDate}
                onChange={(e) => setConsentDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-consent-note" className="block mb-1.5">Note (optional)</Label>
            <Input
              id="c-consent-note"
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              placeholder="e.g. Agreed at event on Jan 12"
            />
          </div>
        </div>

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

/**
 * Bulk-assign dropdown for the contacts-page bulk action bar.
 * Renders a button that opens a small popover listing every
 * non-archived client + an Unassign entry. Selecting one calls
 * onAssign(id | null) — parent confirms and fires the API.
 *
 * When the account has zero non-archived clients, the button still
 * appears and offers only Unassign, so a Pro user without labels
 * yet can still clear a stale one on a selection.
 */
function BulkAssignMenu({
  clients,
  disabled,
  onAssign,
}: {
  clients: ClientLite[];
  disabled: boolean;
  onAssign: (clientId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="gap-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserSquare2 className="w-3.5 h-3.5" />
        Assign to client
        <ChevronDown className="w-3 h-3" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg z-20 py-1"
        >
          {clients.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No clients created yet. Add one in Settings &rarr; Clients.
            </div>
          )}
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onAssign(c.id); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 flex items-center gap-2"
            >
              <span
                aria-hidden
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: c.color ?? "#71717a" }}
              />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-zinc-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAssign(null); }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 text-zinc-600"
          >
            Unassign (clear label)
          </button>
        </div>
      )}
    </div>
  );
}
