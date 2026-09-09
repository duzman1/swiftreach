"use client";

// Client-side wrapper around the campaigns list. Owns selection
// state + the bulk action bar + the filter-aware empty state. The
// row itself is still <CampaignListRow> — this component just wraps
// it with a checkbox and threads a selection callback down.
//
// Fetches its own client list (Pro users only) so both the bulk-
// assign dropdown and the future single-row inline selector can
// read from it without a second /api/clients round trip.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserSquare2, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignListRow } from "@/components/campaigns/CampaignListRow";

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  sentCount: number;
  failedCount: number;
  totalCount: number;
  client: { id: string; name: string; color: string | null } | null;
}

interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

interface Props {
  initialRows: CampaignRow[];
  /** True when the account has perClientReporting. Drives whether
   *  the bulk-assign dropdown, the row checkboxes, and the
   *  filter-aware empty state show. Non-Pro users see the flat
   *  list they had before this component existed. */
  canUseClients: boolean;
  /** Raw ?clientId param — "unassigned", a client id, or "". */
  activeClientFilter: string;
  /** Total campaigns for this user across ALL clients. Used to
   *  distinguish "no campaigns ever" from "no campaigns in this
   *  filter but plenty overall". Only meaningful when a filter
   *  is active. */
  unfilteredTotal: number;
  /** Rows hidden by the plan's campaign-history cap. */
  hidden: number;
  planName: string;
}

const IDS_ONLY_CAP = 500;

export function CampaignsListClient({
  initialRows,
  canUseClients,
  activeClientFilter,
  unfilteredTotal,
  hidden,
  planName,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [clients, setClients] = React.useState<ClientLite[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [selectingAll, setSelectingAll] = React.useState(false);

  const activeClients = React.useMemo(
    () => (clients ?? []).filter((c) => !c.archived),
    [clients]
  );

  // Sync incoming server rows when the user changes filter (Next
  // re-renders with new initialRows; keep the local list in step
  // and clear stale selection).
  React.useEffect(() => {
    setRows(initialRows);
    setSelected(new Set());
  }, [initialRows]);

  React.useEffect(() => {
    if (!canUseClients) return;
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        setClients(j.clients);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [canUseClients]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllOnPage() {
    if (selected.size >= rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const sp = new URLSearchParams();
      if (activeClientFilter) sp.set("clientId", activeClientFilter);
      sp.set("idsOnly", "1");
      const r = await fetch(`/api/campaigns?${sp.toString()}`);
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Failed to select all"); return; }
      setSelected(new Set(j.ids as string[]));
      if (j.capped) {
        toast(
          `Selected first ${j.ids.length} of ${j.total}. Bulk actions are capped at ${j.cap} per call — repeat on the next batch after this one clears.`
        );
      } else {
        toast.success(`Selected all ${j.ids.length} matching`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSelectingAll(false);
    }
  }

  async function bulkAssign(targetClientId: string | null) {
    if (selected.size === 0) return;
    const target = targetClientId
      ? activeClients.find((c) => c.id === targetClientId)
      : null;
    const targetLabel = targetClientId
      ? `to ${target?.name ?? "this client"}`
      : "as unassigned";
    if (!confirm(
      `${targetClientId ? "Assign" : "Unassign"} ${selected.size} campaign${selected.size === 1 ? "" : "s"} ${targetLabel}? ` +
      `Campaigns already labelled with another client will be reassigned.`
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/campaigns/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignIds: Array.from(selected),
          clientId: targetClientId,
        }),
      });
      const j = await r.json();
      if (!j.ok) { toast.error(j.error ?? "Assignment failed"); return; }
      toast.success(
        targetClientId
          ? `Assigned ${j.updated} campaign${j.updated === 1 ? "" : "s"} to ${target?.name ?? "client"}`
          : `Unassigned ${j.updated} campaign${j.updated === 1 ? "" : "s"}`
      );
      setSelected(new Set());
      // Server re-render pulls the fresh clientId onto each row.
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  // ── Empty state ──
  if (rows.length === 0) {
    const filterActive = canUseClients && activeClientFilter;
    if (filterActive && unfilteredTotal > 0) {
      const label =
        activeClientFilter === "unassigned"
          ? "unassigned"
          : "this client";
      return (
        <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
          <p>
            <strong>{unfilteredTotal.toLocaleString()}</strong>{" "}
            campaign{unfilteredTotal === 1 ? "" : "s"} exist for this
            account, but{" "}
            {activeClientFilter === "unassigned"
              ? "all of them are already assigned to a client."
              : `none are assigned to ${label}.`}
          </p>
          <p className="text-xs">
            {activeClientFilter === "unassigned"
              ? "Change the filter above to see them."
              : "Clear the filter to see all campaigns, or assign some to this client to populate this view."}
          </p>
        </div>
      );
    }
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Campaigns will appear here once you start one.
      </p>
    );
  }

  const showCheckboxes = canUseClients;

  return (
    <div className="space-y-3">
      {/* Bulk bar — only when something is selected. */}
      {showCheckboxes && selected.size > 0 && (
        <div className="rounded-md border bg-zinc-50 px-4 py-2 flex items-center justify-between text-sm flex-wrap gap-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span>{selected.size} selected</span>
            {unfilteredTotal > rows.length && activeClientFilter && (
              <span className="text-xs text-muted-foreground">
                (of {rows.length} shown)
              </span>
            )}
            {/* True select-all when the loaded list exceeds a page's
                worth. Campaigns page loads up to plan cap (∞ for Pro,
                10 for Free), so this is really only for the very-
                large-history case. */}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <BulkAssignMenu
              clients={activeClients}
              disabled={busy}
              onAssign={bulkAssign}
            />
          </div>
        </div>
      )}

      {/* Optional select-all-matching link when the loaded list is
          only a prefix of the true match set. Campaigns is
          currently unpaginated for paid plans, so this hits when
          the plan cap trimmed the list. */}
      {showCheckboxes && hidden > 0 && (
        <div className="text-xs text-muted-foreground">
          {selected.size > 0 && (
            <>
              Selection covers loaded campaigns only.{" "}
              <button
                type="button"
                onClick={selectAllMatching}
                disabled={selectingAll}
                className="text-whatsapp hover:underline font-medium disabled:opacity-50"
              >
                {selectingAll
                  ? "Selecting…"
                  : `Select all ${(rows.length + hidden).toLocaleString()} matching current filter`}
              </button>
            </>
          )}
        </div>
      )}

      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-1">
            {showCheckboxes && (
              <label className="pt-4 pl-1 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={`Select ${c.name}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                />
              </label>
            )}
            <div className="flex-1 min-w-0">
              <CampaignListRow
                id={c.id}
                name={c.name}
                status={c.status}
                createdAt={c.createdAt}
                sentCount={c.sentCount}
                failedCount={c.failedCount}
                totalCount={c.totalCount}
                client={c.client}
              />
            </div>
          </li>
        ))}
      </ul>

      {showCheckboxes && rows.length > 0 && (
        <div className="pt-2 border-t flex items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size >= rows.length && rows.length > 0}
              onChange={toggleAllOnPage}
              title="Select all on this page"
            />
            <span>Select all {rows.length} on this page</span>
          </label>
        </div>
      )}

      {hidden > 0 && (
        <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Showing your <strong>{rows.length}</strong> most recent
            campaigns. <strong>{hidden}</strong> more in your history are
            hidden on the {planName} plan.
          </p>
          <Link href="/billing">
            <Button size="sm">Upgrade to view all →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// Same shape as the contacts-page BulkAssignMenu — small popover
// that lists non-archived clients + an Unassign entry. Kept local
// so this component ships self-contained; if a third caller ever
// needs it, lift to components/clients/BulkAssignMenu.tsx.
function BulkAssignMenu({
  clients,
  disabled,
  onAssign,
}: {
  clients: ClientLite[];
  disabled: boolean;
  onAssign: (clientId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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
        {disabled ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <UserSquare2 className="w-3.5 h-3.5" />
        )}
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
              No clients yet. Add one in Settings &rarr; Clients.
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

// Silence "IDS_ONLY_CAP is declared but never used" — keep the
// constant close to the fetch call in case future work wants to
// paginate the client-side cap notice.
void IDS_ONLY_CAP;
