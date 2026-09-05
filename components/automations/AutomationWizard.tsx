"use client";

// 4-step wizard for creating an automation.
//
//   Step 1 — pick type (birthday / anniversary / custom_date)
//   Step 2 — upload contact file, choose phone & date columns,
//            preview parsed dates
//   Step 3 — compose the automated message (freeform or template)
//   Step 4 — schedule (send time + days-before)
//   Submit — POST /api/automations, redirect to detail page
//
// Uses the existing parseSheetByIndex + detectSheets helpers so
// XLSX/XLSM/CSV all work the same way as the campaign wizard's
// upload does.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectSheets, parseSheetByIndex, type ParsedFile } from "@/lib/parseFile";
import {
  parseDateToMonthDay,
  formatMonthDay,
} from "@/lib/dateUtils";

type Step = 1 | 2 | 3 | 4;

type AutomationType = "birthday" | "anniversary" | "custom_date";

const TYPE_META: Record<
  AutomationType,
  { icon: string; label: string; desc: string; sampleName: string }
> = {
  birthday: {
    icon: "🎂",
    label: "Birthday Messages",
    desc: "Send a birthday greeting on each contact's birthday.",
    sampleName: "Member Birthday Messages",
  },
  anniversary: {
    icon: "💍",
    label: "Anniversary Messages",
    desc: "Celebrate anniversaries with your contacts.",
    sampleName: "Wedding Anniversary Wishes",
  },
  custom_date: {
    icon: "📅",
    label: "Custom Date Messages",
    desc: "Send messages on any recurring date column in your list.",
    sampleName: "Renewal Reminders",
  },
};

export function AutomationWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [submitting, setSubmitting] = React.useState(false);

  // Step 1
  const [type, setType] = React.useState<AutomationType>("birthday");
  const [name, setName] = React.useState("");

  // Step 2
  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<ParsedFile | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [phoneColumn, setPhoneColumn] = React.useState("");
  const [dateColumn, setDateColumn] = React.useState("");

  // Step 3
  const [message, setMessage] = React.useState(
    "Happy Birthday {{Name}}! 🎂\nWishing you a wonderful day.\nFrom all of us at SwiftReach."
  );

  // Step 4
  const [sendHour, setSendHour] = React.useState(9);
  const [sendMinute, setSendMinute] = React.useState(0);
  const [daysBeforeDate, setDaysBeforeDate] = React.useState(0);

  // Set the display default name when type changes and name is empty.
  React.useEffect(() => {
    if (!name.trim()) setName(TYPE_META[type].sampleName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function handleFile(f: File) {
    setFile(f);
    setParsed(null);
    setParseError(null);
    setPhoneColumn("");
    setDateColumn("");
    try {
      const sheets = await detectSheets(f);
      // For automation UX we don't do a sheet picker — pick the
      // first non-empty sheet automatically.
      const idx = sheets.defaultSheetIndex ?? 0;
      const p = await parseSheetByIndex(f, idx);
      if (p.rows.length === 0) {
        setParseError("The file has no data rows.");
        return;
      }
      setParsed(p);
      // Heuristic column auto-detection
      const phoneGuess = p.headers.find((h) => /phone|mobile|cell|number/i.test(h));
      const dateGuess =
        type === "birthday"
          ? p.headers.find((h) => /birth|dob/i.test(h))
          : type === "anniversary"
            ? p.headers.find((h) => /anniversary|wedding|marriage/i.test(h))
            : p.headers.find((h) => /date/i.test(h));
      if (phoneGuess) setPhoneColumn(phoneGuess);
      if (dateGuess) setDateColumn(dateGuess);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read file");
    }
  }

  // Preview parsed dates for the first 3 rows once column is picked.
  const preview = React.useMemo(() => {
    if (!parsed || !dateColumn) return [];
    const nameKey =
      parsed.headers.find((h) => /^(full\s*)?name$/i.test(h)) ??
      parsed.headers[0];
    return parsed.rows.slice(0, 3).map((r) => {
      const nameVal = String(r[nameKey ?? ""] ?? "").trim();
      const rawDate = String(r[dateColumn] ?? "").trim();
      const md = parseDateToMonthDay(rawDate);
      return {
        name: nameVal || "(no name)",
        raw: rawDate || "(empty)",
        parsed: md ? formatMonthDay(md.month, md.day) : "(unparseable)",
        ok: md !== null,
      };
    });
  }, [parsed, dateColumn]);

  const validCount = React.useMemo(() => {
    if (!parsed || !dateColumn || !phoneColumn) return 0;
    let n = 0;
    for (const r of parsed.rows) {
      const phone = String(r[phoneColumn] ?? "").trim();
      const date = String(r[dateColumn] ?? "").trim();
      if (phone && parseDateToMonthDay(date)) n++;
    }
    return n;
  }, [parsed, dateColumn, phoneColumn]);

  async function submit() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          mode: "freeform",
          message,
          phoneColumn,
          dateColumn,
          sendHour,
          sendMinute,
          daysBeforeDate,
          rows: parsed.rows,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Failed to create automation");
        setSubmitting(false);
        return;
      }
      toast.success(
        `Created — ${data.contactsAdded} contact${data.contactsAdded === 1 ? "" : "s"} added` +
          (data.skippedInvalidPhone || data.skippedInvalidDate
            ? ` (${data.skippedInvalidPhone + data.skippedInvalidDate} skipped)`
            : "")
      );
      router.push(`/automations/${data.automation.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-whatsapp" />
          Create Automation
        </h1>
        <StepIndicator step={step} />
      </header>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-6">
          <h2 className="font-semibold text-lg">
            What kind of automation do you want to create?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(TYPE_META) as AutomationType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`text-left rounded-lg border p-4 hover:border-whatsapp transition ${
                  type === t
                    ? "border-whatsapp bg-whatsapp/5 ring-2 ring-whatsapp/30"
                    : "border-zinc-200"
                }`}
              >
                <div className="text-2xl">{TYPE_META[t].icon}</div>
                <div className="mt-2 font-medium text-zinc-900">
                  {TYPE_META[t].label}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {TYPE_META[t].desc}
                </div>
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="name" className="text-sm">
              Give this automation a name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={TYPE_META[type].sampleName}
              className="mt-1.5"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!name.trim()} className="gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
          <h2 className="font-semibold text-lg">Upload your contact list</h2>
          <p className="text-sm text-zinc-600">
            The file must contain a phone-number column and a date column
            (birthday, anniversary, etc.). Supports .xlsx, .xlsm, .csv.
          </p>

          <label className="block border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center cursor-pointer hover:bg-zinc-50 hover:border-whatsapp transition">
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />
            <Upload className="w-6 h-6 mx-auto text-zinc-400" />
            <div className="mt-2 text-sm text-zinc-700">
              {file ? file.name : "Click to select or drop a file"}
            </div>
          </label>

          {parseError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          {parsed && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone column</Label>
                  <select
                    value={phoneColumn}
                    onChange={(e) => setPhoneColumn(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— select —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Date column</Label>
                  <select
                    value={dateColumn}
                    onChange={(e) => setDateColumn(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— select —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {dateColumn && preview.length > 0 && (
                <div className="rounded-md border border-zinc-200 overflow-hidden">
                  <div className="px-3 py-2 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    Sample dates parsed
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-t border-zinc-100">
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2 text-zinc-500 font-mono text-xs">
                            {p.raw}
                          </td>
                          <td className="px-3 py-2">
                            {p.ok ? (
                              <span className="text-emerald-700">→ {p.parsed}</span>
                            ) : (
                              <span className="text-red-600">→ {p.parsed}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t border-zinc-100 text-xs text-zinc-600">
                    <strong>{validCount}</strong> of {parsed.rows.length}{" "}
                    contact{parsed.rows.length === 1 ? "" : "s"} will be added
                    (invalid dates or phone numbers skipped).
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!parsed || !phoneColumn || !dateColumn || validCount === 0}
              className="gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && parsed && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
          <h2 className="font-semibold text-lg">Compose your automated message</h2>
          <p className="text-sm text-zinc-600">
            Use <code className="bg-zinc-100 px-1 rounded">{"{{Column}}"}</code>{" "}
            placeholders to personalize. Any column from your file can be used.
          </p>
          <div>
            <Label htmlFor="msg" className="text-sm">
              Message
            </Label>
            <textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Available columns:</div>
            <div className="flex flex-wrap gap-1">
              {parsed.headers.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() =>
                    setMessage((prev) => `${prev}{{${h}}}`)
                  }
                  className="text-xs bg-zinc-100 hover:bg-zinc-200 rounded px-2 py-1"
                >
                  {`{{${h}}}`}
                </button>
              ))}
            </div>
          </div>
          {preview[0]?.ok && (
            <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Preview (first contact)
              </div>
              <div className="text-sm whitespace-pre-wrap">
                {renderPreview(message, parsed.rows[0])}
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(4)}
              disabled={!message.trim()}
              className="gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
          <h2 className="font-semibold text-lg">When should messages send?</h2>
          <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-xs text-sky-800">
            <strong>Send window:</strong> Messages send between 5am–9am in
            your recipients&apos; local time zone (US). The daily cron fires
            once at 13:00 UTC.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Preferred send hour (informational)</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <select
                  value={sendHour}
                  onChange={(e) => setSendHour(parseInt(e.target.value, 10))}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-zinc-500">
                  Displayed on the automation detail page.
                </span>
              </div>
            </div>
            <div>
              <Label className="text-sm">Send</Label>
              <select
                value={daysBeforeDate}
                onChange={(e) =>
                  setDaysBeforeDate(parseInt(e.target.value, 10))
                }
                className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                <option value={0}>On the date</option>
                <option value={1}>1 day before</option>
                <option value={2}>2 days before</option>
                <option value={3}>3 days before</option>
                <option value={7}>1 week before</option>
              </select>
            </div>
          </div>
          <div className="rounded-md border border-zinc-200 p-4 bg-zinc-50 text-sm text-zinc-700">
            <div>
              <strong>{name}</strong> · {TYPE_META[type].label}
            </div>
            <div className="mt-1 text-xs">
              {validCount} contact{validCount === 1 ? "" : "s"} · Sends at{" "}
              {formatHour(sendHour)} local (approx.){" "}
              {daysBeforeDate > 0
                ? `· ${daysBeforeDate} day${daysBeforeDate === 1 ? "" : "s"} before`
                : ""}
            </div>
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(3)}
              disabled={submitting}
            >
              Back
            </Button>
            <Button onClick={submit} disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>Create Automation</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Type", "Contacts", "Message", "Schedule"];
  return (
    <div className="flex items-center gap-2 mt-3 text-xs">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <React.Fragment key={l}>
            <div
              className={`flex items-center gap-1.5 ${
                active
                  ? "text-whatsapp font-semibold"
                  : done
                    ? "text-emerald-700"
                    : "text-zinc-400"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-mono ${
                  active
                    ? "bg-whatsapp text-white"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {n}
              </span>
              {l}
            </div>
            {i < labels.length - 1 && (
              <span className="text-zinc-300">›</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function renderPreview(template: string, row: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (m, k: string) => {
    const key = k.trim();
    return row[key] != null ? String(row[key]) : m;
  });
}

function formatHour(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h12}:00 ${suffix}`;
}
