"use client";

// Small inline "Client: <chip>" control on the campaign detail
// header. Click to open a popover of the account's non-archived
// clients + an Unassign option; picking one fires
// PUT /api/campaigns/[id] with the new clientId. Optimistically
// updates the chip and rolls back on error.
//
// Pro-only — the parent server component doesn't render this at
// all for non-Pro accounts.

import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { ClientChip } from "@/components/clients/ClientFilter";

interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

interface Props {
  campaignId: string;
  initialClient: { id: string; name: string; color: string | null } | null;
}

export function CampaignClientSelector({ campaignId, initialClient }: Props) {
  const [client, setClient] = React.useState<
    { id: string; name: string; color: string | null } | null
  >(initialClient);
  const [clients, setClients] = React.useState<ClientLite[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (clients !== null) return;
    if (!open) return;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setClients(j.clients);
      })
      .catch(() => { /* silent */ });
  }, [open, clients]);

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

  const active = (clients ?? []).filter((c) => !c.archived);

  async function assign(target: ClientLite | null) {
    setOpen(false);
    const prev = client;
    // Optimistic update. Rollback on failure.
    setClient(
      target
        ? { id: target.id, name: target.name, color: target.color }
        : null
    );
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: target?.id ?? null }),
      });
      const j = await r.json();
      if (!j.ok) {
        setClient(prev);
        toast.error(j.error ?? "Failed to update client");
        return;
      }
      toast.success(target ? `Assigned to ${target.name}` : "Client cleared");
    } catch (e) {
      setClient(prev);
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1.5">
      <span className="text-xs">Client:</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-whatsapp/40 disabled:opacity-50"
      >
        {client ? (
          <ClientChip client={client} />
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg z-20 py-1"
        >
          {clients === null && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading clients…
            </div>
          )}
          {clients !== null && active.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No clients yet. Add one in Settings &rarr; Clients.
            </div>
          )}
          {active.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              onClick={() => assign(c)}
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
          {clients !== null && (
            <>
              <div className="my-1 border-t border-zinc-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => assign(null)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 text-zinc-600"
              >
                Unassign (clear label)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
