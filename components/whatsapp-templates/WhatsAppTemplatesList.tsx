"use client";

// Live list of the user's Meta-approved WhatsApp templates. Fetches from
// /api/whatsapp/templates on mount and on manual refresh. This is the
// only UI surface that exercises the `whatsapp_business_management`
// scope — the API route it calls hits GET /{waba_id}/message_templates.

import * as React from "react";
import { Loader2, RefreshCw, AlertCircle, Copy, Check } from "lucide-react";

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  bodyText: string;
  headerFormat: string | null;
  footerText: string | null;
  variableCount: number;
}

interface ApiResponse {
  ok: boolean;
  templates?: Template[];
  error?: string;
  metaCode?: number | null;
}

export function WhatsAppTemplatesList() {
  const [templates, setTemplates] = React.useState<Template[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [copiedName, setCopiedName] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/whatsapp/templates", { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setTemplates(json.templates ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function copy(name: string) {
    void navigator.clipboard.writeText(name).then(() => {
      setCopiedName(name);
      window.setTimeout(() => setCopiedName(null), 1500);
    });
  }

  const filtered = React.useMemo(() => {
    if (!templates) return [];
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.bodyText.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [templates, query]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-10 flex items-center justify-center text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading templates from Meta…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">Could not load templates</div>
            <div className="mt-1">{error}</div>
          </div>
          <button
            onClick={load}
            className="shrink-0 text-xs px-2 py-1 rounded border border-red-300 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center space-y-3">
        <div className="text-sm font-medium text-zinc-900">
          No approved templates yet
        </div>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Create and submit templates in{" "}
          <a
            href="https://business.facebook.com/wa/manage/message-templates"
            target="_blank"
            rel="noreferrer"
            className="text-whatsapp hover:underline"
          >
            Meta Business Manager → WhatsApp Manager
          </a>
          . Once Meta approves them (usually within a few minutes to a few
          hours), they appear here.
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          placeholder="Search by name, body text, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
        />
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="text-xs text-zinc-500">
        {filtered.length} of {templates.length} template
        {templates.length === 1 ? "" : "s"} · synced live from Meta
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {filtered.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  onClick={() => copy(t.name)}
                  className="group flex items-center gap-1.5 text-sm font-mono font-semibold text-zinc-900 hover:text-whatsapp"
                  title="Copy template name"
                >
                  <span className="truncate">{t.name}</span>
                  {copiedName === t.name ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-whatsapp" />
                  )}
                </button>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{t.language}</span>
                  <span>·</span>
                  <span>
                    {t.variableCount} variable
                    {t.variableCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <StatusPill status={t.status} category={t.category} />
            </div>

            {t.bodyText && (
              <div className="rounded bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {t.bodyText}
              </div>
            )}

            {t.footerText && (
              <div className="text-[11px] italic text-zinc-500">
                Footer: {t.footerText}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  category,
}: {
  status: string;
  category: string;
}) {
  const s = status?.toUpperCase();
  const tones: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
    DISABLED: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  const tone = tones[s] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${tone}`}
      >
        {s}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-zinc-400">
        {category}
      </span>
    </div>
  );
}
