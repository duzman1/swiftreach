"use client";

// Developer webhooks — manage outbound HTTPS endpoints that receive
// signed event POSTs from SwiftReach. Backed by the Step 3 API
// (/api/webhooks/endpoints + /api/webhooks/deliveries). The dispatcher
// lives in lib/webhookDispatcher.ts (Step 4) and the retry worker in
// /api/cron/webhook-retry (Step 5).
//
// Single-file page: list + create modal + rotate modal + delete
// confirm + delivery-log panel + payload viewer. Kept in one file
// to make it easy to grep for "endpoint" state transitions; any of
// the modals could be lifted out later if we add more.

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Send,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Pause,
  Play,
  X,
  Code2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mirror lib/webhookEvents.ts — duplicated client-side (one small
// array) because importing from lib brings in Node crypto types.
// Keep in sync if new event types ship.
const EVENT_TYPES = [
  { value: "message.sent",      label: "Message sent",        desc: "Meta confirmed the send left WhatsApp" },
  { value: "message.delivered", label: "Message delivered",   desc: "Reached the recipient's device" },
  { value: "message.read",      label: "Message read",        desc: "Recipient opened it" },
  { value: "message.failed",    label: "Message failed",      desc: "Meta refused or returned an error" },
  { value: "message.replied",   label: "Message replied",     desc: "Recipient sent a reply back" },
  { value: "contact.opted_out", label: "Contact opted out",   desc: "Recipient texted STOP or similar" },
] as const;

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  eventType: string;
  status: "PENDING" | "DELIVERED" | "FAILED" | "DEAD";
  attempts: number;
  nextAttemptAt: string;
  lastResponseCode: number | null;
  lastError: string | null;
  createdAt: string;
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = React.useState<Endpoint[] | null>(null);
  const [endpointLimit, setEndpointLimit] = React.useState(10);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Endpoint | "new" | null>(null);
  const [rotating, setRotating] = React.useState<Endpoint | null>(null);
  const [revealedSecret, setRevealedSecret] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  // Delivery log: shared across the page, optionally filtered by
  // endpoint. User clicks an endpoint card to pin the filter.
  const [deliveries, setDeliveries] = React.useState<Delivery[] | null>(null);
  const [deliveriesLoading, setDeliveriesLoading] = React.useState(false);
  const [deliveryFilter, setDeliveryFilter] = React.useState<string | "ALL">("ALL");
  const [payloadViewerId, setPayloadViewerId] = React.useState<string | null>(null);

  async function loadEndpoints() {
    setLoading(true);
    try {
      const r = await fetch("/api/webhooks/endpoints");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setEndpoints(j.endpoints);
      setEndpointLimit(j.limit ?? 10);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }

  async function loadDeliveries(endpointId?: string) {
    setDeliveriesLoading(true);
    try {
      const q = endpointId && endpointId !== "ALL" ? `?endpointId=${endpointId}` : "";
      const r = await fetch(`/api/webhooks/deliveries${q}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      setDeliveries(j.deliveries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load deliveries");
    } finally {
      setDeliveriesLoading(false);
    }
  }

  React.useEffect(() => {
    loadEndpoints();
    loadDeliveries();
  }, []);

  React.useEffect(() => {
    loadDeliveries(deliveryFilter === "ALL" ? undefined : deliveryFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryFilter]);

  async function sendTest(ep: Endpoint) {
    setTestingId(ep.id);
    try {
      const r = await fetch(`/api/webhooks/endpoints/${ep.id}/test`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Test event queued — watch the delivery log.");
      // Delivery log refreshes immediately so the user sees the
      // PENDING row; dispatcher runs in the background and the row
      // will flip to DELIVERED / FAILED within a few seconds.
      setTimeout(() => loadDeliveries(deliveryFilter === "ALL" ? undefined : deliveryFilter), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  async function toggleActive(ep: Endpoint) {
    try {
      const r = await fetch(`/api/webhooks/endpoints/${ep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !ep.active }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success(ep.active ? "Endpoint paused" : "Endpoint re-enabled");
      loadEndpoints();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function confirmDelete(id: string) {
    try {
      const r = await fetch(`/api/webhooks/endpoints/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Endpoint deleted");
      setDeletingId(null);
      loadEndpoints();
      // Also reload deliveries — the deleted endpoint's rows cascade.
      loadDeliveries(deliveryFilter === "ALL" ? undefined : deliveryFilter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const atLimit = (endpoints?.length ?? 0) >= endpointLimit;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Webhook className="w-7 h-7 text-whatsapp" />
            Webhooks
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Register HTTPS URLs to receive signed POSTs when messages move
            through SwiftReach — sent, delivered, read, failed, replied, or
            opted out. See the{" "}
            <Link href="/developers" className="text-whatsapp hover:underline">
              developer docs
            </Link>{" "}
            for the event payload shape + signature verification.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setEditing("new")}
          disabled={atLimit}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New endpoint
        </Button>
      </header>

      {/* ── Endpoints list ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Endpoints</span>
            <span className="text-xs font-normal text-muted-foreground">
              {endpoints?.length ?? 0} of {endpointLimit}
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            Each endpoint receives a POST with a per-request{" "}
            <code className="bg-zinc-100 px-1 rounded">X-SwiftReach-Signature</code>{" "}
            header — verify with the shared secret shown on create.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !endpoints ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : endpoints && endpoints.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 py-10 text-center text-sm text-muted-foreground">
              No endpoints yet. Add one and point it at your GoHighLevel inbound
              webhook URL, or any other service that accepts signed JSON POSTs.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
              {endpoints?.map((ep) => (
                <li key={ep.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            ep.active ? "bg-emerald-500" : "bg-zinc-300"
                          }`}
                          aria-label={ep.active ? "Active" : "Paused"}
                        />
                        <code className="font-mono text-sm truncate" title={ep.url}>
                          {ep.url}
                        </code>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {ep.events.map((e) => (
                          <span
                            key={e}
                            className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-zinc-100 text-zinc-700"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                      {ep.failureCount > 0 && (
                        <div className="mt-2 text-xs text-amber-800 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {ep.failureCount} consecutive failure{ep.failureCount === 1 ? "" : "s"}
                          {ep.failureCount >= 20 && !ep.active && " — auto-paused"}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => sendTest(ep)}
                        disabled={testingId === ep.id || !ep.active}
                        title={ep.active ? "Send test event" : "Re-enable to test"}
                        className="h-8 gap-1"
                      >
                        {testingId === ep.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(ep)}
                        title={ep.active ? "Pause" : "Re-enable"}
                        className="h-8 w-8 p-0"
                      >
                        {ep.active ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(ep)}
                        title="Edit events / URL"
                        className="h-8 w-8 p-0"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRotating(ep)}
                        title="Rotate secret"
                        className="h-8 w-8 p-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingId(ep.id)}
                        title="Delete"
                        className="h-8 w-8 p-0 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Delivery log ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Recent deliveries</span>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="h-8 text-xs rounded-md border border-zinc-300 px-2 bg-white font-normal"
            >
              <option value="ALL">All endpoints</option>
              {endpoints?.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.url.replace(/^https:\/\//, "")}
                </option>
              ))}
            </select>
          </CardTitle>
          <CardDescription className="text-xs">
            The last 50 dispatch attempts. Click a row to inspect the signed
            JSON body SwiftReach sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveriesLoading && !deliveries ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : !deliveries || deliveries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No deliveries yet. Press <strong>Test</strong> on an endpoint to
              fire one.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Attempts</th>
                    <th className="px-3 py-2 font-medium">Response</th>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2"><StatusPill status={d.status} /></td>
                      <td className="px-3 py-2 font-mono">{d.eventType}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.attempts}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate" title={d.lastError ?? ""}>
                        {d.lastResponseCode !== null ? `HTTP ${d.lastResponseCode}` : d.lastError ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setPayloadViewerId(d.id)}
                          className="text-whatsapp hover:underline text-[11px]"
                        >
                          View payload
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modals ─────────────────────────────────────────── */}
      {editing && (
        <EndpointModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(secret) => {
            setEditing(null);
            loadEndpoints();
            if (secret) setRevealedSecret(secret);
          }}
        />
      )}
      {rotating && (
        <RotateModal
          endpoint={rotating}
          onClose={() => setRotating(null)}
          onRotated={(secret) => {
            setRotating(null);
            setRevealedSecret(secret);
          }}
        />
      )}
      {revealedSecret && (
        <SecretModal
          secret={revealedSecret}
          onClose={() => setRevealedSecret(null)}
        />
      )}
      {deletingId && (
        <ConfirmDeleteModal
          onCancel={() => setDeletingId(null)}
          onConfirm={() => confirmDelete(deletingId)}
        />
      )}
      {payloadViewerId && (
        <PayloadViewerModal
          deliveryId={payloadViewerId}
          onClose={() => setPayloadViewerId(null)}
        />
      )}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────

function StatusPill({ status }: { status: Delivery["status"] }) {
  const cfg = {
    DELIVERED: { bg: "bg-emerald-100", text: "text-emerald-800", icon: <CheckCircle2 className="w-3 h-3" /> },
    PENDING:   { bg: "bg-zinc-100",    text: "text-zinc-700",    icon: <Clock className="w-3 h-3" /> },
    FAILED:    { bg: "bg-amber-100",   text: "text-amber-800",   icon: <AlertTriangle className="w-3 h-3" /> },
    DEAD:      { bg: "bg-red-100",     text: "text-red-800",     icon: <XCircle className="w-3 h-3" /> },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {status}
    </span>
  );
}

// ── Create / edit endpoint modal ──────────────────────────

function EndpointModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Endpoint | null;
  onClose: () => void;
  onSaved: (secret: string | null) => void;
}) {
  const [url, setUrl] = React.useState(initial?.url ?? "");
  const [events, setEvents] = React.useState<string[]>(
    initial?.events ?? ["message.sent", "message.delivered", "message.read", "message.failed"]
  );
  const [saving, setSaving] = React.useState(false);

  function toggle(e: string) {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function save() {
    if (!url.trim()) { toast.error("URL is required"); return; }
    if (events.length === 0) { toast.error("Pick at least one event"); return; }
    setSaving(true);
    try {
      const target = initial ? `/api/webhooks/endpoints/${initial.id}` : "/api/webhooks/endpoints";
      const method = initial ? "PATCH" : "POST";
      const r = await fetch(target, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Save failed");
      toast.success(initial ? "Endpoint updated" : "Endpoint created");
      onSaved(j.secret ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={initial ? "Edit endpoint" : "New endpoint"} onClose={onClose}>
      <div>
        <Label htmlFor="ep-url" className="block mb-1.5">Destination URL</Label>
        <Input
          id="ep-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://services.leadconnectorhq.com/hooks/..."
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          HTTPS only. Private IPs + localhost rejected (SSRF defence).
        </p>
      </div>

      <div className="space-y-2">
        <Label>Subscribe to events</Label>
        <div className="space-y-1.5">
          {EVENT_TYPES.map((ev) => (
            <label key={ev.value} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={events.includes(ev.value)}
                onChange={() => toggle(ev.value)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  <code className="text-xs font-mono text-zinc-600">{ev.value}</code>
                  <span className="ml-2 font-normal">{ev.label}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{ev.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {initial ? "Save changes" : "Create endpoint"}
        </Button>
      </div>
    </ModalShell>
  );
}

// ── Rotate-secret confirm modal ───────────────────────────

function RotateModal({
  endpoint,
  onClose,
  onRotated,
}: {
  endpoint: Endpoint;
  onClose: () => void;
  onRotated: (secret: string) => void;
}) {
  const [rotating, setRotating] = React.useState(false);

  async function rotate() {
    setRotating(true);
    try {
      const r = await fetch(`/api/webhooks/endpoints/${endpoint.id}/secret`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast.success("Secret rotated");
      onRotated(j.secret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotate failed");
    } finally {
      setRotating(false);
    }
  }

  return (
    <ModalShell title="Rotate signing secret?" onClose={onClose}>
      <p className="text-sm text-zinc-700">
        A new secret is generated. Every outbound POST from this point —
        including retries of pending deliveries — will be signed with the new
        value. Update your receiver&apos;s secret BEFORE rotating, or it will
        start rejecting requests with 401.
      </p>
      <p className="text-xs text-muted-foreground">
        Endpoint: <code className="font-mono">{endpoint.url}</code>
      </p>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={rotating}>Cancel</Button>
        <Button onClick={rotate} disabled={rotating} variant="destructive" className="gap-2">
          {rotating && <Loader2 className="w-4 h-4 animate-spin" />}
          Rotate
        </Button>
      </div>
    </ModalShell>
  );
}

// ── Secret-reveal modal (one-time display) ────────────────

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard not available");
    }
  }
  return (
    <ModalShell title="Copy this secret now" onClose={onClose}>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>This is the ONLY time this secret will be shown.</strong> Store
        it in your receiver&apos;s config before closing — if you lose it,
        rotate to generate a new one.
      </div>
      <div className="relative">
        <code className="block font-mono text-[11px] bg-zinc-900 text-zinc-100 rounded-md p-3 pr-20 break-all">
          {secret}
        </code>
        <Button
          size="sm"
          onClick={copy}
          className="absolute right-2 top-2 gap-1 h-7 text-xs"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Verification is HMAC-SHA256 over <code className="bg-zinc-100 px-1">{"${t}.${rawBody}"}</code>.
        See{" "}
        <Link href="/developers" className="text-whatsapp hover:underline">
          /developers <ExternalLink className="inline w-3 h-3" />
        </Link>{" "}
        for the full scheme.
      </p>
      <div className="flex items-center justify-end pt-2">
        <Button onClick={onClose}>Done — I&apos;ve saved it</Button>
      </div>
    </ModalShell>
  );
}

// ── Delete confirm ────────────────────────────────────────

function ConfirmDeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModalShell title="Delete endpoint?" onClose={onCancel}>
      <p className="text-sm text-zinc-700">
        The endpoint and every row in its delivery log are removed. PENDING
        deliveries for this endpoint vanish — they will NOT be sent. This
        can&apos;t be undone.
      </p>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} variant="destructive">Delete</Button>
      </div>
    </ModalShell>
  );
}

// ── Payload viewer ────────────────────────────────────────

function PayloadViewerModal({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<{ payload: unknown; endpointUrl: string; eventType: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/webhooks/deliveries/${deliveryId}`);
        const j = await r.json();
        if (!j.ok) throw new Error(j.error ?? "Failed");
        setData({
          payload: j.delivery.payload,
          endpointUrl: j.delivery.endpointUrl,
          eventType: j.delivery.eventType,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [deliveryId]);

  return (
    <ModalShell title="Delivery payload" onClose={onClose} wide>
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            POSTed to <code className="font-mono bg-zinc-100 px-1 rounded">{data.endpointUrl}</code>
          </div>
          <pre className="font-mono text-[11px] bg-zinc-900 text-zinc-100 rounded-md p-3 overflow-auto max-h-[60vh]">
{JSON.stringify(data.payload, null, 2)}
          </pre>
        </>
      )}
      <div className="flex justify-end pt-2">
        <Button onClick={onClose}>Close</Button>
      </div>
    </ModalShell>
  );
}

// ── Shared modal shell ────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-background rounded-lg shadow-xl ${wide ? "max-w-3xl" : "max-w-xl"} w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
