"use client";

import * as React from "react";
import { ExternalLink, Plus, X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ParsedFile } from "@/lib/parseFile";
import type { HeaderMedia, HeaderMediaType, VariableMapping } from "@/lib/whatsapp";

/** Fetch Meta template statuses once per mount. Uses the same
 *  cached endpoint the compliance dashboard hits, so a user
 *  bouncing between the two pages doesn't re-hammer Meta. Fails
 *  silent — an unavailable Meta status just means no pill, not a
 *  broken wizard. */
interface TemplateStatusEntry {
  name: string;
  status: string;
}
function useTemplateStatuses(): TemplateStatusEntry[] | null {
  const [entries, setEntries] = React.useState<TemplateStatusEntry[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/compliance/meta-status");
        const j = await r.json();
        if (cancelled || !j.ok || !j.connected || !j.templates?.counts) return;
        // meta-status endpoint returns counts + blocking; for the
        // per-template pill we need the full list — fetch it from
        // the whatsapp/templates route which already carries name+status.
        const r2 = await fetch("/api/whatsapp/templates");
        const j2 = await r2.json();
        if (cancelled || !j2.ok) return;
        setEntries(
          (j2.templates ?? []).map((t: { name: string; status: string }) => ({
            name: t.name,
            status: t.status,
          }))
        );
      } catch {
        /* silent — no pill is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return entries;
}

function pillFor(status: string): { color: string; icon: React.ReactNode; label: string; note?: string } {
  switch (status) {
    case "APPROVED":
      return {
        color: "bg-emerald-100 text-emerald-800 border-emerald-200",
        icon: <CheckCircle2 className="w-3 h-3" />,
        label: "APPROVED",
      };
    case "REJECTED":
    case "DISABLED":
    case "PENDING_DELETION":
      return {
        color: "bg-red-100 text-red-800 border-red-200",
        icon: <XCircle className="w-3 h-3" />,
        label: status,
        note: "Meta will not deliver messages on this template.",
      };
    case "PENDING":
      return {
        color: "bg-amber-100 text-amber-800 border-amber-200",
        icon: <AlertTriangle className="w-3 h-3" />,
        label: "PENDING",
        note: "Awaiting Meta approval. Wait before building a campaign.",
      };
    case "PAUSED":
    case "LIMITED":
    case "IN_APPEAL":
      return {
        color: "bg-amber-100 text-amber-800 border-amber-200",
        icon: <AlertTriangle className="w-3 h-3" />,
        label: status,
        note: "Meta has restricted delivery — sends may throttle or fail.",
      };
    default:
      return {
        color: "bg-zinc-100 text-zinc-700 border-zinc-200",
        icon: null,
        label: status,
      };
  }
}

interface Props {
  parsed: ParsedFile;
  phoneColumn: string;
  templateName: string;
  onTemplateName: (v: string) => void;
  templateLanguage: string;
  onTemplateLanguage: (v: string) => void;
  variableMap: VariableMapping[];
  onVariableMap: (v: VariableMapping[]) => void;
  // Templates with an image/video/document header need a media URL.
  // null = no header (text-only template). Owned by the parent wizard
  // so it persists through the final campaign POST body.
  headerMedia: HeaderMedia | null;
  onHeaderMedia: (v: HeaderMedia | null) => void;
  onTestSend: () => void;
  testSending: boolean;
}

export function TemplateMapper({
  parsed,
  phoneColumn,
  templateName,
  onTemplateName,
  templateLanguage,
  onTemplateLanguage,
  variableMap,
  onVariableMap,
  headerMedia,
  onHeaderMedia,
  onTestSend,
  testSending,
}: Props) {
  const insertableHeaders = parsed.headers.filter((h) => h !== phoneColumn);
  const statuses = useTemplateStatuses();
  // Case-insensitive lookup on template name — Meta names are
  // case-sensitive but users often mistype casing; the status pill
  // matches exact first, then a case-insensitive fallback to catch
  // "MyTemplate" vs "mytemplate" typos so the pill still appears.
  const matched = React.useMemo(() => {
    if (!statuses || !templateName.trim()) return null;
    const exact = statuses.find((s) => s.name === templateName.trim());
    if (exact) return exact;
    return statuses.find((s) => s.name.toLowerCase() === templateName.trim().toLowerCase()) ?? null;
  }, [statuses, templateName]);
  const pill = matched ? pillFor(matched.status) : null;

  function addRow() {
    const next = [...variableMap];
    next.push({
      metaVar: String(next.length + 1),
      source: "column",
      column: insertableHeaders[0] ?? "",
    });
    onVariableMap(next);
  }

  function updateRow(i: number, patch: Partial<VariableMapping>) {
    const next = variableMap.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onVariableMap(next);
  }

  function removeRow(i: number) {
    const next = variableMap
      .filter((_, idx) => idx !== i)
      .map((m, idx) => ({ ...m, metaVar: String(idx + 1) }));
    onVariableMap(next);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr,auto] gap-3 items-end">
        <div>
          <Label htmlFor="template-name" className="block mb-1.5">
            Template name
          </Label>
          <Input
            id="template-name"
            value={templateName}
            onChange={(e) => onTemplateName(e.target.value)}
            placeholder="exact_template_name_from_meta"
          />
          {/* Meta approval pill. Shows only when we can match the
              typed name to a template on the user's WABA. Silent
              when the user hasn't connected Meta or hasn't typed
              a name yet — no false alarms. */}
          {pill && (
            <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${pill.color}`}>
              {pill.icon}
              <span>{pill.label}</span>
              {pill.note && (
                <span className="font-normal opacity-90 ml-1">— {pill.note}</span>
              )}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="template-lang" className="block mb-1.5">
            Language
          </Label>
          <Input
            id="template-lang"
            value={templateLanguage}
            onChange={(e) => onTemplateLanguage(e.target.value)}
            placeholder="en_US"
          />
        </div>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-whatsapp hover:underline inline-flex items-center gap-1 pb-3"
        >
          <ExternalLink className="w-3 h-3" />
          Meta template manager
        </a>
      </div>

      {/* Media-header picker. Templates with an image/video/document
          header declared in Meta's template editor REQUIRE a URL here
          at send time — otherwise Meta rejects with
          "Parameter format does not match format in the created
          template" (error 131053). Leave set to "None" for text-only
          templates. */}
      <MediaHeaderBlock value={headerMedia} onChange={onHeaderMedia} />

      <div className="rounded-md border bg-zinc-50">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Variable mapping
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            Add variable
          </Button>
        </div>

        {variableMap.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">
            No variables mapped yet. Add a row for each <code>{"{{1}}"}</code>,{" "}
            <code>{"{{2}}"}</code>, etc. that your template uses.
          </p>
        ) : (
          <ul className="divide-y">
            {variableMap.map((m, i) => (
              <li key={i} className="p-3 grid grid-cols-1 md:grid-cols-[80px,120px,1fr,auto] gap-2 items-center">
                <code className="text-xs font-mono text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-1.5 text-center">
                  {`{{${m.metaVar}}}`}
                </code>
                <Select
                  value={m.source}
                  onChange={(e) =>
                    updateRow(i, { source: e.target.value as "column" | "static" })
                  }
                >
                  <option value="column">From column</option>
                  <option value="static">Static value</option>
                </Select>
                {m.source === "column" ? (
                  <Select
                    value={m.column ?? ""}
                    onChange={(e) => updateRow(i, { column: e.target.value })}
                  >
                    <option value="">Select column…</option>
                    {insertableHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={m.value ?? ""}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    placeholder="Same value for every contact"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onTestSend}
          disabled={testSending || !templateName.trim()}
          className="gap-1"
        >
          Test template (uses first contact)
        </Button>
      </div>
    </div>
  );
}

// ── Media header block ───────────────────────────────────────────
// Separate component so the dropdown + URL state stays close to the
// fields it controls, and so adding a preview of the picked media
// later (thumbnail, filesize check) is a one-file change.

function MediaHeaderBlock({
  value,
  onChange,
}: {
  value: HeaderMedia | null;
  onChange: (v: HeaderMedia | null) => void;
}) {
  const type = value?.type ?? "none";
  const link = value?.link ?? "";
  const filename = value?.filename ?? "";

  function setType(next: string) {
    if (next === "none") {
      onChange(null);
      return;
    }
    const t = next as HeaderMediaType;
    onChange({ type: t, link, ...(t === "document" && filename ? { filename } : {}) });
  }
  function setLink(next: string) {
    if (!value) return;
    onChange({ ...value, link: next });
  }
  function setFilename(next: string) {
    if (!value || value.type !== "document") return;
    onChange({ ...value, filename: next });
  }

  // Lightweight client-side hint — matches the server's rules so
  // users see the problem before they hit Start Campaign. The actual
  // reject still happens server-side; this is just a courtesy.
  const linkHint = React.useMemo(() => {
    if (type === "none" || !link.trim()) return null;
    try {
      const u = new URL(link.trim());
      if (u.protocol !== "https:") return "URL must start with https://";
      return null;
    } catch {
      return "URL doesn't parse";
    }
  }, [type, link]);

  return (
    <div className="rounded-md border bg-zinc-50">
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Media header
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-8 text-xs rounded-md border border-zinc-300 px-2 bg-white font-normal"
        >
          <option value="none">None — text-only template</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="document">Document</option>
        </select>
      </div>

      {type === "none" ? (
        <p className="text-xs text-muted-foreground px-3 py-3">
          Leave as <strong>None</strong> for templates without a header, or
          for templates whose header is text (text headers don&apos;t need a
          URL — map them like any other body variable). Pick a media type
          if Meta&apos;s template editor shows an Image / Video / Document
          header for this template.
        </p>
      ) : (
        <div className="p-3 space-y-2">
          <div>
            <Label htmlFor="hm-link" className="block mb-1.5 text-xs">
              {type === "image" ? "Image URL" : type === "video" ? "Video URL" : "Document URL"}
            </Label>
            <Input
              id="hm-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://… (publicly reachable)"
            />
            {linkHint && (
              <p className="text-[11px] text-amber-700 mt-1">{linkHint}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {type === "image" && "PNG / JPG, up to 5 MB. Meta fetches the URL at send time — it must be publicly reachable (no basic-auth, no cookie-gated URLs)."}
              {type === "video" && "MP4 / 3GP, up to 16 MB. Meta fetches at send time; the URL must be publicly reachable."}
              {type === "document" && "PDF / DOC / DOCX / PPT / PPTX / XLS / XLSX, up to 100 MB. Meta fetches at send time; the URL must be publicly reachable."}
            </p>
          </div>
          {type === "document" && (
            <div>
              <Label htmlFor="hm-filename" className="block mb-1.5 text-xs">
                Filename (optional)
              </Label>
              <Input
                id="hm-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="receipt.pdf"
                maxLength={240}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Shown to the recipient under the document icon. Falls back to
                the URL&apos;s last path segment if blank.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
