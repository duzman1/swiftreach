"use client";

// Interactive API key manager. Three states:
//   1. Empty / list — table of existing keys + "+ New Key" button.
//   2. Create modal — name input → POST /api/api-keys → success modal.
//   3. Reveal modal — shows the plain key ONCE with a Copy button.
//                     Plain key is held in component state and discarded
//                     when the modal closes.
//
// Per-row dropdown: View Logs (inline panel), Revoke (with confirm).

import * as React from "react";
import {
  Loader2,
  Plus,
  Copy,
  Check,
  Trash2,
  History,
  X,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

interface LogRow {
  id: string;
  phoneNumber: string;
  messageType: string;
  status: string;
  errorMessage: string | null;
  responseTimeMs: number | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  rate_limited: "bg-amber-100 text-amber-700",
  invalid: "bg-zinc-100 text-zinc-700",
};

interface Props {
  initialPlan: string;
  maxKeys: number;
}

export function ApiKeysClient({ maxKeys }: Props) {
  const [keys, setKeys] = React.useState<ApiKeyRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revealKey, setRevealKey] = React.useState<{
    plain: string;
    name: string;
  } | null>(null);
  const [openLogsForId, setOpenLogsForId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/api-keys");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed to load");
      setKeys(j?.data?.keys ?? j?.keys ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const usedSlots = keys?.length ?? 0;
  const atLimit = usedSlots >= maxKeys;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {usedSlots} of {maxKeys} key{maxKeys === 1 ? "" : "s"} in use
        </p>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={atLimit}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white gap-1.5"
          size="sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Key
        </Button>
      </div>

      {atLimit && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          You&apos;ve hit your plan&apos;s key limit. Revoke an existing
          key or upgrade your plan to create another.
        </div>
      )}

      {loading && !keys ? (
        <div className="py-10 text-center text-sm text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Loading…
        </div>
      ) : keys && keys.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          No API keys yet. Create your first key to connect SwiftReach to
          other apps.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-right">Requests</th>
                <th className="px-3 py-2 text-right">Last used</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys?.map((k) => (
                <React.Fragment key={k.id}>
                  <tr className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                      {k.keyPrefix}…{k.keySuffix}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {k.requestCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-zinc-500">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() =>
                            setOpenLogsForId(
                              openLogsForId === k.id ? null : k.id
                            )
                          }
                          className="p-1.5 rounded hover:bg-zinc-200 text-zinc-600"
                          aria-label="View logs"
                          title="View logs"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <RevokeButton id={k.id} name={k.name} onRevoked={load} />
                      </div>
                    </td>
                  </tr>
                  {openLogsForId === k.id && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 bg-zinc-50">
                        <KeyLogs apiKeyId={k.id} keyName={k.name} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateKeyModal
          onClose={() => setCreateOpen(false)}
          onCreated={(plain, name) => {
            setCreateOpen(false);
            setRevealKey({ plain, name });
            load();
          }}
        />
      )}

      {revealKey && (
        <RevealKeyModal
          plainKey={revealKey.plain}
          name={revealKey.name}
          onClose={() => setRevealKey(null)}
        />
      )}
    </div>
  );
}

// ── Create key modal ────────────────────────────────────────────────────

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (plainKey: string, name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed");
      const plain = j?.data?.key ?? j?.key;
      if (!plain) throw new Error("Server didn't return the key");
      onCreated(plain, name.trim());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create New API Key" onClose={busy ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="key-name" className="block mb-1.5">
            Key Name
          </Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Zapier", "My Website", "n8n"'
            maxLength={60}
            autoFocus
          />
          <p className="text-xs text-zinc-500 mt-1">
            Internal label only — visible just to you.
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-zinc-100">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="flex-1 bg-whatsapp hover:bg-whatsapp-dark text-white gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Generate Key
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Reveal key modal — shown ONCE ───────────────────────────────────────

function RevealKeyModal({
  plainKey,
  name,
  onClose,
}: {
  plainKey: string;
  name: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainKey);
      setCopied(true);
      toast.success("Key copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy — select and press Ctrl/Cmd+C.");
    }
  }

  return (
    <Modal title="✅ API Key Generated" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Copy this key now. <strong>It won&apos;t be shown again.</strong>
          </span>
        </div>

        <div className="text-xs text-zinc-500">
          Key for: <strong className="text-zinc-700">{name}</strong>
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 flex items-center gap-2">
          <code className="flex-1 text-xs font-mono break-all text-zinc-800">
            {plainKey}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={copy}
            className="shrink-0 gap-1"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="text-xs text-zinc-600">
          Use this key in the Authorization header:
          <pre className="mt-1 px-2 py-1.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[11px] overflow-x-auto">
            Authorization: Bearer {plainKey}
          </pre>
        </div>

        <Button
          onClick={onClose}
          className="w-full bg-whatsapp hover:bg-whatsapp-dark text-white"
        >
          I&apos;ve copied my key — Done
        </Button>
      </div>
    </Modal>
  );
}

// ── Revoke button + confirm ────────────────────────────────────────────

function RevokeButton({
  id,
  name,
  onRevoked,
}: {
  id: string;
  name: string;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  async function go() {
    if (
      !confirm(
        `Revoke "${name}"? Any apps using this key will stop working immediately.`
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed");
      toast.success("Key revoked");
      onRevoked();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50"
      aria-label="Revoke key"
      title="Revoke key"
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ── Per-key logs panel ─────────────────────────────────────────────────

function KeyLogs({ apiKeyId, keyName }: { apiKeyId: string; keyName: string }) {
  const [logs, setLogs] = React.useState<LogRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/api-keys/${apiKeyId}/logs`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setLogs(j?.data?.logs ?? j?.logs ?? []);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to load logs")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiKeyId]);

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">
        {keyName} — recent activity
      </div>
      {loading && !logs && (
        <div className="text-xs text-zinc-400 py-4 text-center">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
          Loading…
        </div>
      )}
      {logs && logs.length === 0 && (
        <div className="text-xs text-zinc-500 py-4 text-center">
          No requests yet for this key.
        </div>
      )}
      {logs && logs.length > 0 && (
        <table className="min-w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-1 text-left">Time</th>
              <th className="px-2 py-1 text-left">Phone</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-right">Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-2 py-1 text-zinc-600">
                  {new Date(l.createdAt).toLocaleTimeString()}
                </td>
                <td className="px-2 py-1 font-mono">{l.phoneNumber}</td>
                <td className="px-2 py-1 text-zinc-500">{l.messageType}</td>
                <td className="px-2 py-1">
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] rounded uppercase ${
                      STATUS_BADGE[l.status] ?? "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {l.status.replace("_", " ")}
                  </span>
                  {l.errorMessage && (
                    <div className="text-[10px] text-red-600 mt-0.5">
                      {l.errorMessage}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-zinc-500">
                  {l.responseTimeMs != null ? `${l.responseTimeMs}ms` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-[10px] text-zinc-400 mt-2 text-right">
        Showing last 20 requests
      </div>
    </div>
  );
}

// ── Modal shell ─────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 my-10 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
