"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Loader2, Save, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportContacts } from "./ImportContacts";
import { ColumnDetector } from "./ColumnDetector";
import { VariablePool, type CustomVar } from "./VariablePool";
import { ModeToggle, type SendMode } from "./ModeToggle";
import { MessageEditor } from "./MessageEditor";
import { LivePreview } from "./LivePreview";
import { ValidationSummary } from "./ValidationSummary";
import { FormatRulesEditor } from "./FormatRulesEditor";
import { CampaignSettings, isCampaignNameInvalid } from "./CampaignSettings";
import { ContactReviewTable } from "./ContactReviewTable";
import { ProgressPanel } from "./ProgressPanel";
import { TemplateMapper } from "./TemplateMapper";
import { SendTiming, combineToISO, type SendTimingState } from "./SendTiming";
import {
  ReconciliationSummary,
  type Resolution,
} from "@/components/templates/ReconciliationSummary";
import {
  validateTemplate,
  findTokenSpans,
  type FormatRule,
} from "@/lib/buildMessage";
import { applyFilters, type FilterRule } from "@/lib/applyFilters";
import { isValidPhone, normalizePhone } from "@/lib/phoneUtils";
import type { ParsedFile } from "@/lib/parseFile";
import type { VariableMapping } from "@/lib/whatsapp";
import { toast } from "sonner";

type CreatedCampaign = {
  id: string;
  name: string;
  totalCount: number;
  skippedCount: number;
};

export function WizardSend() {
  const [parsed, setParsed] = React.useState<ParsedFile | null>(null);
  const [phoneColumn, setPhoneColumn] = React.useState("");
  const [defaultCountryCode, setDefaultCountryCode] = React.useState("1");
  const [customVars, setCustomVars] = React.useState<CustomVar[]>([]);
  const [mode, setMode] = React.useState<SendMode>("freeform");

  // Mode A
  const [template, setTemplate] = React.useState("");
  const [formatRules, setFormatRules] = React.useState<Record<string, FormatRule>>({});

  // Mode B
  const [templateName, setTemplateName] = React.useState("");
  const [templateLanguage, setTemplateLanguage] = React.useState("en_US");
  const [variableMap, setVariableMap] = React.useState<VariableMapping[]>([]);

  // Step 4
  const [campaignName, setCampaignName] = React.useState("");
  const [delayMs, setDelayMs] = React.useState(2000);
  const [filters, setFilters] = React.useState<FilterRule[]>([]);

  // Step 4 — save to contact book (Phase 6). Off by default — opting in
  // adds every valid row to SavedContact after the campaign is created.
  const [saveToBook, setSaveToBook] = React.useState(false);
  const [saveBookGroupName, setSaveBookGroupName] = React.useState("");

  // Step 4 — send timing (Phase 6). Defaults to "send now" so existing
  // muscle memory still works.
  const [sendTiming, setSendTiming] = React.useState<SendTimingState>(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      moment: "now",
      date: tomorrow.toISOString().slice(0, 10),
      time: "09:00",
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles"
          : "America/Los_Angeles",
      recurring: false,
      recurrence: "weekly",
      recurrenceDay: 1,
    };
  });
  const router = useRouter();

  // Step 5 — track which row indices (post-filter) are explicitly skipped
  const [skippedIndices, setSkippedIndices] = React.useState<number[]>([]);

  // Test send
  const [testPhone, setTestPhone] = React.useState("");
  const [testSending, setTestSending] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; msg: string } | null>(null);

  // Send pipeline
  const [creating, setCreating] = React.useState(false);
  const [running, setRunning] = React.useState<CreatedCampaign | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // ── Load saved defaults once on mount ──────────────────────────────────
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/settings");
        const data = await res.json();
        if (data.ok) {
          setDefaultCountryCode(data.settings.defaultCountryCode ?? "1");
          setDelayMs(data.settings.defaultDelayMs ?? 2000);
        }
      } catch {
        /* fall back to component defaults */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Template load/save ─────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams?.get("template") ?? null;

  type PendingTemplate = {
    id: string;
    name: string;
    content: string;
    staticVars: Record<string, string>;
    formatRules: Record<string, FormatRule>;
    tokens: string[];
  };
  const [pendingTemplate, setPendingTemplate] = React.useState<PendingTemplate | null>(null);
  const [resolutions, setResolutions] = React.useState<Record<string, Resolution>>({});
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const [saveTemplateName, setSaveTemplateName] = React.useState("");
  const [saveModalOpen, setSaveModalOpen] = React.useState(false);
  const consumedTemplateRef = React.useRef<string | null>(null);

  // Fetch template by URL once on mount
  React.useEffect(() => {
    if (!templateIdFromUrl) return;
    if (consumedTemplateRef.current === templateIdFromUrl) return;
    consumedTemplateRef.current = templateIdFromUrl;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${templateIdFromUrl}`);
        const data = await res.json();
        if (!data.ok) {
          toast.error(data.error ?? "Failed to load template");
          return;
        }
        const tpl = data.template;
        const tokens: string[] = [];
        for (const m of (tpl.content as string).matchAll(/\{\{([^}]+)\}\}/g)) {
          tokens.push(m[1].trim());
        }
        const uniqueTokens = Array.from(new Set(tokens));
        setPendingTemplate({
          id: tpl.id,
          name: tpl.name,
          content: tpl.content,
          staticVars: JSON.parse(tpl.staticVars || "{}"),
          formatRules: JSON.parse(tpl.formatRules || "{}"),
          tokens: uniqueTokens,
        });
        toast.message(
          parsed
            ? "Template loaded — reconcile its variables below."
            : "Template ready. Upload your contact file to continue."
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error");
      }
    })();
  }, [templateIdFromUrl, parsed]);

  // Once a file is parsed AND a template is pending, build initial resolutions.
  React.useEffect(() => {
    if (!pendingTemplate || !parsed) return;
    const fileColumns = parsed.headers.filter((h) => h !== phoneColumn);
    const next: Record<string, Resolution> = {};
    for (const t of pendingTemplate.tokens) {
      if (fileColumns.includes(t)) {
        next[t] = { kind: "matched", column: t };
      } else if (pendingTemplate.staticVars[t] !== undefined) {
        next[t] = { kind: "static", value: pendingTemplate.staticVars[t] };
      } else {
        next[t] = { kind: "unresolved" };
      }
    }
    setResolutions(next);
  }, [pendingTemplate, parsed, phoneColumn]);

  function applyPendingTemplate() {
    if (!pendingTemplate) return;
    setTemplate(pendingTemplate.content);
    // Build customVars from static resolutions only (matched/column live as
    // file column refs, no need to add as custom).
    const newCustom: CustomVar[] = [];
    for (const [token, res] of Object.entries(resolutions)) {
      if (res.kind === "static") {
        newCustom.push({ name: token, value: res.value });
      }
    }
    // Merge into existing custom vars (don't duplicate by name).
    setCustomVars((prev) => {
      const seen = new Set(prev.map((c) => c.name));
      const additions = newCustom.filter((c) => !seen.has(c.name));
      return [...prev, ...additions];
    });
    // Bring across saved format rules
    setFormatRules((prev) => ({ ...pendingTemplate.formatRules, ...prev }));
    // Bump usage on the server (fire-and-forget)
    fetch(`/api/templates/${pendingTemplate.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bumpUsage: true }),
    }).catch(() => undefined);
    toast.success(`Template "${pendingTemplate.name}" applied`);
    setPendingTemplate(null);
    setResolutions({});
  }

  async function saveAsTemplate() {
    const name = saveTemplateName.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }
    if (!template.trim()) {
      toast.error("Cannot save an empty message");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          content: template,
          staticVars: staticVarsObjForSave(),
          formatRules,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success(`Saved as "${name}"`);
      setSaveModalOpen(false);
      setSaveTemplateName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingTemplate(false);
    }
  }

  // We can't reference staticVarsObj in saveAsTemplate before it's declared
  // below, so capture a snapshot via a getter.
  function staticVarsObjForSave(): Record<string, string> {
    return Object.fromEntries(customVars.map((c) => [c.name, c.value]));
  }

  // ── Parsed file lifecycle ────────────────────────────────────────────────
  function handleParsed(file: ParsedFile) {
    setParsed(file);
    setPhoneColumn("");
    setSkippedIndices([]);
  }
  function handleClear() {
    setParsed(null);
    setPhoneColumn("");
    setCustomVars([]);
    setTemplate("");
    setFormatRules({});
    setTemplateName("");
    setVariableMap([]);
    setCampaignName("");
    setFilters([]);
    setSkippedIndices([]);
    setRunning(null);
    setCreateError(null);
  }

  // ── Custom var handlers ─────────────────────────────────────────────────
  function addCustomVar(name: string, value: string) {
    setCustomVars((p) => [...p, { name, value }]);
  }
  function editCustomVar(originalName: string, name: string, value: string) {
    setCustomVars((p) => p.map((c) => (c.name === originalName ? { name, value } : c)));
    if (originalName !== name && formatRules[originalName]) {
      setFormatRules((p) => {
        const n = { ...p };
        n[name] = n[originalName];
        delete n[originalName];
        return n;
      });
    }
  }
  function deleteCustomVar(name: string) {
    setCustomVars((p) => p.filter((c) => c.name !== name));
  }

  // ── Editor helpers ─────────────────────────────────────────────────────
  function insertChip(name: string) {
    if (name === phoneColumn) return;
    const token = `{{${name}}}`;
    const ta = textareaRef.current;
    if (!ta) {
      setTemplate((t) => t + token);
      return;
    }
    const start = ta.selectionStart ?? template.length;
    const end = ta.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + token.length;
      ta.setSelectionRange(cursor, cursor);
    });
  }
  function addUnknownAsCustom(name: string) {
    if (customVars.some((c) => c.name === name)) return;
    addCustomVar(name, "");
  }
  function replaceToken(oldName: string, newName: string) {
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\{\\{\\s*" + escaped + "\\s*\\}\\}", "g");
    setTemplate((t) => t.replace(re, `{{${newName}}}`));
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const staticVarsObj = React.useMemo<Record<string, string>>(
    () => Object.fromEntries(customVars.map((c) => [c.name, c.value])),
    [customVars]
  );
  const sampleRow = parsed?.rows[0] ?? {};
  const validation = React.useMemo(
    () => validateTemplate(template, sampleRow, staticVarsObj),
    [template, sampleRow, staticVarsObj]
  );
  const spans = React.useMemo(
    () => findTokenSpans(template, sampleRow, staticVarsObj),
    [template, sampleRow, staticVarsObj]
  );

  const filteredRows = React.useMemo(
    () => (parsed ? applyFilters(parsed.rows, filters) : []),
    [parsed, filters]
  );

  const willSendCount = React.useMemo(() => {
    if (!parsed) return 0;
    let count = 0;
    const skip = new Set(skippedIndices);
    for (let i = 0; i < filteredRows.length; i++) {
      if (skip.has(i)) continue;
      const phone = normalizePhone(
        filteredRows[i][phoneColumn] ?? "",
        defaultCountryCode
      );
      if (isValidPhone(phone)) count++;
    }
    return count;
  }, [parsed, filteredRows, skippedIndices, phoneColumn, defaultCountryCode]);

  const readyToSend =
    parsed !== null &&
    phoneColumn !== "" &&
    !isCampaignNameInvalid(campaignName) &&
    willSendCount > 0 &&
    (mode === "freeform"
      ? template.trim() !== "" && validation.unknown.length === 0
      : templateName.trim() !== "");

  // ── Test send ──────────────────────────────────────────────────────────
  async function runTestSend() {
    if (!parsed) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const firstRow = parsed.rows[0] ?? {};
      const phoneToUse = testPhone || (firstRow[phoneColumn] ?? "");
      const body =
        mode === "freeform"
          ? {
              mode: "freeform" as const,
              phoneNumber: phoneToUse,
              defaultCountryCode,
              template,
              rowData: firstRow,
              staticVars: staticVarsObj,
              formatRules,
            }
          : {
              mode: "template" as const,
              phoneNumber: phoneToUse,
              defaultCountryCode,
              templateName,
              templateLanguage,
              variableMap,
              rowData: firstRow,
              staticVars: staticVarsObj,
            };
      const res = await fetch("/api/messages/send-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          msg: `Sent! Message ID: ${data.messageId ?? "(unknown)"}`,
        });
        toast.success("Test message sent");
      } else {
        setTestResult({
          ok: false,
          msg: `${data.code ? `[${data.code}] ` : ""}${data.error ?? "Unknown error"}`,
        });
        toast.error(`Test failed: ${data.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTestSending(false);
    }
  }

  // ── Save campaign contacts into the Contact Book (best-effort) ───────
  async function maybeSaveToBook() {
    if (!saveToBook || !parsed) return;
    try {
      // Strip skipped rows and build the import payload. Server normalises
      // the phone again — we just pass the raw values.
      const payload = {
        contacts: filteredRows
          .filter((_, i) => !skippedIndices.includes(i))
          .map((row) => ({
            phoneNumber: row[phoneColumn] ?? "",
            data: Object.fromEntries(
              Object.entries(row).filter(([k]) => k !== phoneColumn)
            ),
          })),
        defaultCountryCode,
        groupName: saveBookGroupName.trim() || undefined,
      };
      const r = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(
          `Saved ${j.created + j.updated} to Contact Book` +
            (j.invalid > 0 ? ` (${j.invalid} invalid skipped)` : "")
        );
      }
    } catch {
      // Non-fatal — campaign already created, don't surface a toast error.
    }
  }

  // ── Create + start campaign ────────────────────────────────────────────
  async function startCampaign() {
    if (!parsed || !readyToSend) return;

    // Branch: scheduled vs. immediate. Both fire the same shaped wizard
    // payload, just to different endpoints.
    if (sendTiming.moment === "schedule") {
      const iso = combineToISO(sendTiming.date, sendTiming.time);
      if (!iso) {
        setCreateError("Pick a valid date and time to schedule.");
        toast.error("Pick a valid date and time to schedule.");
        return;
      }
      if (new Date(iso).getTime() < Date.now() - 60_000) {
        setCreateError("Scheduled time must be in the future.");
        toast.error("Scheduled time must be in the future.");
        return;
      }

      setCreating(true);
      setCreateError(null);
      try {
        const body = {
          name: campaignName.trim(),
          mode,
          rawMessage: mode === "freeform" ? template : undefined,
          templateName: mode === "template" ? templateName : undefined,
          templateLanguage: mode === "template" ? templateLanguage : undefined,
          variableMap: mode === "template" ? variableMap : undefined,
          staticVars: staticVarsObj,
          formatRules,
          phoneColumn,
          delayMs,
          // Filters were already applied client-side into filteredRows;
          // strip skipped rows so the schedule fires the exact set the
          // user reviewed.
          contacts: filteredRows.filter(
            (_, i) => !skippedIndices.includes(i)
          ),
          scheduledFor: iso,
          timezone: sendTiming.timezone,
          recurring: sendTiming.recurring,
          recurrence: sendTiming.recurring ? sendTiming.recurrence : null,
          recurrenceDay: sendTiming.recurring ? sendTiming.recurrenceDay : null,
        };
        const res = await fetch("/api/scheduled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) {
          setCreateError(data.error ?? "Failed to schedule campaign");
          toast.error(data.error ?? "Failed to schedule campaign");
          return;
        }
        toast.success(
          `Scheduled for ${new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`
        );
        await maybeSaveToBook();
        setConfirmOpen(false);
        router.push("/scheduled");
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Network error");
      } finally {
        setCreating(false);
      }
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const body = {
        name: campaignName.trim(),
        mode,
        rawMessage: mode === "freeform" ? template : undefined,
        templateName: mode === "template" ? templateName : undefined,
        templateLanguage: mode === "template" ? templateLanguage : undefined,
        variableMap: mode === "template" ? variableMap : undefined,
        staticVars: staticVarsObj,
        formatRules,
        phoneColumn,
        defaultCountryCode,
        delayMs,
        filters,
        rows: filteredRows,
        skippedIndices,
      };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setCreateError(data.error ?? "Failed to create campaign");
        toast.error(data.error ?? "Failed to create campaign");
        return;
      }
      toast.success(`Campaign "${data.campaign.name}" started`);
      await maybeSaveToBook();
      setRunning(data.campaign);
      setConfirmOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (running) {
    return (
      <div className="space-y-6">
        <ProgressPanel
          campaignId={running.id}
          campaignName={running.name}
          initialTotal={running.totalCount}
        />
        <Card>
          <CardContent className="p-6 flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              You can close this page — the send continues on the server. Resume
              progress from <a className="text-whatsapp hover:underline" href={`/campaigns/${running.id}`}>the campaign detail page</a>.
            </p>
            <Button variant="outline" onClick={handleClear}>
              Start a new campaign
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Upload contacts</CardTitle>
          <CardDescription>
            Drop an Excel or CSV file. The first row should contain column
            headers — those headers become your variable names.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportContacts
            parsed={parsed}
            onParsed={handleParsed}
            onClear={handleClear}
            defaultCountryCode={defaultCountryCode}
          />
        </CardContent>
      </Card>

      {parsed && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Step 2 — Confirm columns</CardTitle>
              <CardDescription>
                Pick which column holds the phone number. Everything else
                becomes a usable variable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ColumnDetector
                parsed={parsed}
                phoneColumn={phoneColumn}
                onPhoneColumn={setPhoneColumn}
                defaultCountryCode={defaultCountryCode}
                onDefaultCountryCode={setDefaultCountryCode}
              />
            </CardContent>
          </Card>

          {pendingTemplate && (
            <ReconciliationSummary
              templateName={pendingTemplate.name}
              tokens={pendingTemplate.tokens}
              fileColumns={parsed.headers.filter((h) => h !== phoneColumn)}
              resolutions={resolutions}
              onChange={(token, res) =>
                setResolutions((prev) => ({ ...prev, [token]: res }))
              }
              onApply={applyPendingTemplate}
              onCancel={() => {
                setPendingTemplate(null);
                setResolutions({});
              }}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Step 3 — Compose your message</CardTitle>
              <CardDescription>
                Click a chip to insert a variable. Live preview updates per
                contact on the right.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ModeToggle mode={mode} onChange={setMode} enableTemplate />

              {mode === "freeform" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3 min-w-0">
                    <VariablePool
                      parsed={parsed}
                      phoneColumn={phoneColumn}
                      customVars={customVars}
                      onAddCustom={addCustomVar}
                      onEditCustom={editCustomVar}
                      onDeleteCustom={deleteCustomVar}
                      onInsert={insertChip}
                    />
                    <MessageEditor
                      value={template}
                      onChange={setTemplate}
                      spans={spans}
                      textareaRef={textareaRef}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSaveTemplateName("");
                          setSaveModalOpen(true);
                        }}
                        disabled={!template.trim()}
                        className="gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save as template
                      </Button>
                    </div>
                    <ValidationSummary
                      result={validation}
                      candidateNames={[
                        ...parsed.headers.filter((h) => h !== phoneColumn),
                        ...customVars.map((c) => c.name),
                      ]}
                      onAddUnknown={addUnknownAsCustom}
                      onReplaceToken={replaceToken}
                    />
                    <FormatRulesEditor
                      parsed={parsed}
                      phoneColumn={phoneColumn}
                      resolvedNames={validation.resolved}
                      formatRules={formatRules}
                      onChange={setFormatRules}
                    />
                  </div>
                  <div className="lg:sticky lg:top-6 lg:self-start min-w-0">
                    <LivePreview
                      parsed={parsed}
                      phoneColumn={phoneColumn}
                      template={template}
                      staticVars={staticVarsObj}
                      formatRules={formatRules}
                    />
                  </div>
                </div>
              )}

              {mode === "template" && (
                <TemplateMapper
                  parsed={parsed}
                  phoneColumn={phoneColumn}
                  templateName={templateName}
                  onTemplateName={setTemplateName}
                  templateLanguage={templateLanguage}
                  onTemplateLanguage={setTemplateLanguage}
                  variableMap={variableMap}
                  onVariableMap={setVariableMap}
                  onTestSend={runTestSend}
                  testSending={testSending}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 4 — Campaign settings</CardTitle>
              <CardDescription>
                Name, delay between messages, send timing, and optional contact filters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CampaignSettings
                parsed={parsed}
                phoneColumn={phoneColumn}
                campaignName={campaignName}
                onCampaignName={setCampaignName}
                delayMs={delayMs}
                onDelayMs={setDelayMs}
                filters={filters}
                onFilters={(next) => {
                  setFilters(next);
                  setSkippedIndices([]); // filter changes invalidate row indices
                }}
              />
              <SendTiming value={sendTiming} onChange={setSendTiming} />

              <div className="rounded-md border bg-zinc-50 p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToBook}
                    onChange={(e) => setSaveToBook(e.target.checked)}
                  />
                  Save these contacts to my Contact Book
                </label>
                {saveToBook && (
                  <div className="pl-6 max-w-md">
                    <Label htmlFor="save-group" className="block mb-1.5 text-xs">
                      Group name (optional — creates a new group, or omit to save without grouping)
                    </Label>
                    <Input
                      id="save-group"
                      value={saveBookGroupName}
                      onChange={(e) => setSaveBookGroupName(e.target.value)}
                      placeholder="e.g. April 2026 Cohort"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 5 — Review &amp; send</CardTitle>
              <CardDescription>
                Uncheck rows to skip individual contacts. Click &quot;View&quot; to see the
                full personalized message.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ContactReviewTable
                parsed={parsed}
                phoneColumn={phoneColumn}
                defaultCountryCode={defaultCountryCode}
                template={template}
                staticVars={staticVarsObj}
                formatRules={formatRules}
                filters={filters}
                skippedIndices={skippedIndices}
                onSkippedIndicesChange={setSkippedIndices}
              />

              <div className="rounded-md border bg-zinc-50 p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Send a single test first
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="test-phone" className="block mb-1.5">
                      Recipient (defaults to first contact)
                    </Label>
                    <Input
                      id="test-phone"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+1 555-123-4567"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={runTestSend}
                    disabled={testSending || !readyToSend && !templateName.trim()}
                    className="gap-1"
                  >
                    {testSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send test
                  </Button>
                </div>
                {testResult && (
                  <div
                    className={`text-xs rounded p-2 ${
                      testResult.ok
                        ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                        : "bg-red-50 border border-red-200 text-red-900"
                    }`}
                  >
                    {testResult.msg}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t">
                <div className="text-sm">
                  <strong>{willSendCount}</strong> contact
                  {willSendCount === 1 ? "" : "s"} will receive a message · est.{" "}
                  {Math.ceil((willSendCount * delayMs) / 60000)} min
                </div>
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!readyToSend}
                >
                  <Send className="w-4 h-4" />
                  {sendTiming.moment === "schedule" ? "Schedule Campaign" : "Start Campaign"}
                </Button>
              </div>

              {!readyToSend && (
                <p className="text-xs text-muted-foreground">
                  Need: a descriptive campaign name (not blank or &quot;Test&quot;), a phone column, at least 1 valid contact, and
                  {mode === "freeform"
                    ? " a message with no unknown variables."
                    : " a template name."}
                </p>
              )}

              {createError && (
                <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-900 p-3">
                  {createError}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {saveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingTemplate && setSaveModalOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Save as template</h3>
            <p className="text-sm text-muted-foreground">
              Saves your current message + custom variables + format rules. Reusable
              with any future contact file.
            </p>
            <div>
              <Label htmlFor="save-tpl-name" className="block mb-1.5">Name</Label>
              <Input
                id="save-tpl-name"
                autoFocus
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveAsTemplate();
                  if (e.key === "Escape" && !savingTemplate) setSaveModalOpen(false);
                }}
                placeholder="e.g. Monthly dues reminder"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSaveModalOpen(false)} disabled={savingTemplate}>
                Cancel
              </Button>
              <Button onClick={saveAsTemplate} disabled={savingTemplate} className="gap-2">
                {savingTemplate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !creating && setConfirmOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold">
                {sendTiming.moment === "schedule" ? "Schedule campaign?" : "Start campaign?"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {sendTiming.moment === "schedule"
                  ? "Will fire automatically at the scheduled time. You can edit or cancel from the Scheduled page."
                  : `Once started, messages are sent one by one with a ${(delayMs / 1000).toFixed(1)}s delay. You can pause or cancel from the progress panel.`}
              </p>
            </div>
            <ul className="text-sm space-y-1 border rounded-md p-3 bg-zinc-50">
              <li><strong>Name:</strong> {campaignName}</li>
              <li><strong>Mode:</strong> {mode === "freeform" ? "Free-Form Text" : `Meta Template (${templateName})`}</li>
              <li><strong>Will send to:</strong> {willSendCount}</li>
              <li><strong>Delay:</strong> {(delayMs / 1000).toFixed(1)}s</li>
              {sendTiming.moment === "schedule" ? (
                <>
                  <li>
                    <strong>Scheduled for:</strong>{" "}
                    {sendTiming.date} {sendTiming.time} ({sendTiming.timezone})
                  </li>
                  {sendTiming.recurring && (
                    <li>
                      <strong>Recurrence:</strong> {sendTiming.recurrence}
                      {sendTiming.recurrence === "weekly" || sendTiming.recurrence === "monthly"
                        ? ` (day ${sendTiming.recurrenceDay})`
                        : ""}
                    </li>
                  )}
                </>
              ) : (
                <li><strong>Estimated time:</strong> ~{Math.ceil((willSendCount * delayMs) / 60000)} min</li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={startCampaign} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendTiming.moment === "schedule" ? "Confirm & Schedule" : "Confirm & Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
