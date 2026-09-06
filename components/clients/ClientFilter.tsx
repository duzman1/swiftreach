"use client";

// Shared filter control for Analytics / Contacts / Campaigns lists.
// Persists the selection in the URL as ?clientId=... so a filtered
// view can be bookmarked and shared.
//
// Values in the URL:
//   (absent)      → All clients
//   "unassigned"  → contacts/campaigns with no label
//   "<cid>"       → specific client
//
// Fetches the client list once from /api/clients and self-hides
// when the user has no clients (avoids empty-dropdown noise on
// accounts that don't use the feature).

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter } from "lucide-react";

interface Client {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
}

const ALL = "";
const UNASSIGNED = "unassigned";

export function ClientFilter({ className = "" }: { className?: string }) {
  const [clients, setClients] = React.useState<Client[] | null>(null);
  const [error, setError] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get("clientId") ?? ALL;

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setClients(j.clients);
        else setError(true);
      })
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, []);

  // Hide the filter entirely when the feature isn't available OR
  // no clients exist — nothing to filter by, don't clutter the UI.
  if (error) return null;
  if (clients && clients.length === 0) return null;

  function setFilter(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next === ALL) params.delete("clientId");
    else params.set("clientId", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const active = clients?.filter((c) => !c.archived) ?? [];
  const archived = clients?.filter((c) => c.archived) ?? [];

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden />
      <select
        value={current}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter by client"
        className="h-8 pl-2 pr-8 text-xs rounded-md border border-zinc-300 bg-white hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
      >
        <option value={ALL}>All clients</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {active.length > 0 && (
          <optgroup label="Clients">
            {active.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {archived.length > 0 && (
          <optgroup label="Archived">
            {archived.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

/** Small colored chip for showing a client label in a list row. */
export function ClientChip({
  client,
  className = "",
}: {
  client: { name: string; color: string | null } | null;
  className?: string;
}) {
  if (!client) return null;
  const color = client.color ?? "#71717a";
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-[160px] px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-50 border border-zinc-200 ${className}`}
      title={client.name}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="truncate">{client.name}</span>
    </span>
  );
}
