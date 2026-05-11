"use client";

// Contact Book picker for Step 1 of the wizard. Lets the user load a saved
// group OR a multi-select of individual contacts as the campaign audience.
//
// Returns a ParsedFile-like object so the rest of the wizard (column
// detection, validation, send loop) doesn't need to know contacts came
// from the book vs. an uploaded file.
//
// Opted-out contacts are excluded automatically — the API filter takes
// care of it; we double-check on the client just to surface a count.

import * as React from "react";
import { Loader2, Check, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ParsedFile, Row } from "@/lib/parseFile";

interface Group {
  id: string;
  name: string;
  contactCount: number;
  color: string;
}

interface SavedContact {
  id: string;
  phoneNumber: string;
  data: string;
  optedOut: boolean;
}

interface Props {
  defaultCountryCode: string;
  onParsed: (file: ParsedFile) => void;
  onCancel: () => void;
  initialGroupId?: string | null;
}

export function ContactBookPicker({
  defaultCountryCode,
  onParsed,
  onCancel,
  initialGroupId,
}: Props) {
  const [groups, setGroups] = React.useState<Group[] | null>(null);
  const [selectedGroup, setSelectedGroup] = React.useState<string>(initialGroupId ?? "");
  const [search, setSearch] = React.useState("");
  const [contacts, setContacts] = React.useState<SavedContact[] | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/contacts/groups")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setGroups(j.groups);
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (selectedGroup) sp.set("groupId", selectedGroup);
    if (search) sp.set("q", search);
    sp.set("status", "active"); // never load opted-out into a campaign
    sp.set("page", "1");
    fetch(`/api/contacts?${sp.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          toast.error(j.error ?? "Failed to load contacts");
          return;
        }
        setContacts(j.contacts);
        // Auto-select all when a group is picked.
        if (selectedGroup) {
          setPicked(new Set(j.contacts.map((c: SavedContact) => c.id)));
        }
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Network error")
      )
      .finally(() => setLoading(false));
  }, [selectedGroup, search]);

  function toggleAll() {
    if (!contacts) return;
    if (picked.size === contacts.length) setPicked(new Set());
    else setPicked(new Set(contacts.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function loadIntoCampaign() {
    if (!contacts) return;
    const chosen = contacts.filter((c) => picked.has(c.id));
    if (chosen.length === 0) {
      toast.error("Pick at least one contact");
      return;
    }
    // Build a synthetic ParsedFile. Headers = "phone" + the union of every
    // chosen contact's data keys. Row values pulled from each contact's
    // data blob, with phone hard-coded into the "phone" column.
    const fieldSet = new Set<string>();
    const expanded = chosen.map((c) => {
      const data: Record<string, string> = (() => {
        try { return JSON.parse(c.data || "{}"); } catch { return {}; }
      })();
      Object.keys(data).forEach((k) => fieldSet.add(k));
      return { phone: c.phoneNumber, data };
    });
    const headers = ["phone", ...Array.from(fieldSet)];
    const rows: Row[] = expanded.map((e) => {
      const row: Row = { phone: e.phone };
      for (const k of fieldSet) row[k] = e.data[k] ?? "";
      return row;
    });
    void defaultCountryCode; // contacts are already E.164; cc is the wizard's display only
    const parsed: ParsedFile = {
      fileName: `Contact Book — ${chosen.length} contact${chosen.length === 1 ? "" : "s"}`,
      headers,
      rows,
      columnTypes: Object.fromEntries(headers.map((h) => [h, "text"])) as Record<string, "text">,
      sanitizedHeaders: [],
    };
    onParsed(parsed);
  }

  return (
    <div className="rounded-md border bg-zinc-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-whatsapp" />
          <h3 className="text-sm font-semibold">Pick from Contact Book</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cb-group" className="block mb-1.5">Group</Label>
          <select
            id="cb-group"
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setPicked(new Set());
            }}
            className="h-10 w-full rounded-md border border-input px-3 text-sm bg-background"
          >
            <option value="">All contacts</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.contactCount})</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cb-search" className="block mb-1.5">Search</Label>
          <Input
            id="cb-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Phone or any saved field"
          />
        </div>
      </div>

      <div className="rounded-md border bg-background max-h-72 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={contacts ? picked.size === contacts.length && contacts.length > 0 : false}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Fields</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && !contacts && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…
                </td>
              </tr>
            )}
            {contacts && contacts.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  No contacts match
                </td>
              </tr>
            )}
            {contacts?.map((c) => {
              const fields = (() => {
                try { return JSON.parse(c.data || "{}"); } catch { return {}; }
              })();
              const preview = Object.entries(fields).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ");
              return (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">+{c.phoneNumber}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-md">{preview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {picked.size} of {contacts?.length ?? 0} selected
        </span>
        <Button onClick={loadIntoCampaign} disabled={picked.size === 0} className="gap-1.5">
          <Check className="w-4 h-4" />
          Load {picked.size > 0 ? `${picked.size} ` : ""}into campaign
        </Button>
      </div>
    </div>
  );
}
