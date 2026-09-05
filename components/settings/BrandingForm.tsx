"use client";

// White-label branding editor. Fields are locked for below-Pro users;
// they still see the section and a live preview of the report header
// so they can evaluate the feature before upgrading.
//
// The live preview mirrors the same header the react-pdf template
// renders. Kept as inline JSX rather than a shared component so the
// styling on-screen can use tailwind without wiring shared tokens
// into react-pdf's StyleSheet.

import * as React from "react";
import { toast } from "sonner";
import { Lock, Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Branding {
  companyName: string;
  logoUrl: string | null;
  accentColor: string;
  footerText: string | null;
  hideSwiftReachBranding: boolean;
}

interface Props {
  initial: Branding;
  canEdit: boolean;
  plan: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandingForm({ initial, canEdit, plan }: Props) {
  const [values, setValues] = React.useState<Branding>(initial);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [colorError, setColorError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function update<K extends keyof Branding>(key: K, v: Branding[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    if (!canEdit) return;
    if (!HEX_RE.test(values.accentColor)) {
      setColorError("Enter a 6-digit hex like #25D366");
      return;
    }
    setColorError(null);
    setSaving(true);
    try {
      const r = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: values.companyName,
          accentColor: values.accentColor,
          footerText: values.footerText ?? "",
          hideSwiftReachBranding: values.hideSwiftReachBranding,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Could not save branding");
        return;
      }
      setValues(j.branding);
      toast.success("Branding saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // let the same file re-trigger onChange later
    if (!canEdit) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }
    const type = file.type.toLowerCase();
    if (type !== "image/png" && type !== "image/jpeg" && type !== "image/jpg") {
      toast.error("Logo must be a PNG or JPG");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/branding/logo", { method: "POST", body: form });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Upload failed");
        return;
      }
      update("logoUrl", j.logoUrl);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    if (!canEdit) return;
    setUploading(true);
    try {
      const r = await fetch("/api/branding/logo", { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Could not remove logo");
        return;
      }
      update("logoUrl", null);
      toast.success("Logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
    }
  }

  // Live report-header preview, rendered from current form state so
  // the user sees changes without generating a PDF.
  const accent = HEX_RE.test(values.accentColor) ? values.accentColor : "#25D366";

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <strong>Pro plan and above.</strong> Editing your report
            branding is a Pro feature. You&apos;re on{" "}
            <span className="capitalize">{plan}</span>. The preview
            below shows what a Pro report would look like with your
            current settings.
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Report header preview
        </div>
        <div
          className="rounded-md bg-white border border-zinc-200 p-6"
          role="img"
          aria-label="Report header preview"
        >
          <div className="flex items-center gap-4">
            {values.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.logoUrl}
                alt={`${values.companyName} logo`}
                className="h-12 max-w-[140px] object-contain"
              />
            ) : (
              <div
                className="text-lg font-semibold text-zinc-900 truncate max-w-[280px]"
                title={values.companyName}
              >
                {values.companyName}
              </div>
            )}
            <div className="flex-1 min-w-0 border-l border-zinc-200 pl-4">
              <div
                className="text-xl font-semibold tracking-tight truncate"
                style={{ color: accent }}
              >
                Campaign Report
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                September 1 – September 30, 2026
              </div>
            </div>
          </div>
          <div
            className="mt-4 h-1 rounded-full"
            style={{ background: accent }}
          />
          {values.footerText && (
            <div className="mt-6 pt-3 border-t border-zinc-200 text-[11px] text-zinc-500 truncate">
              {values.footerText}
            </div>
          )}
        </div>
      </div>

      {/* Fields */}
      <fieldset disabled={!canEdit || saving || uploading} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-zinc-900 block mb-1.5">
            Company name
          </label>
          <input
            type="text"
            value={values.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            maxLength={120}
            className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm disabled:bg-zinc-50 disabled:text-zinc-500"
            placeholder="Your agency or business name"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-900 block mb-1.5">
            Logo (PNG or JPG, 2 MB max)
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {values.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.logoUrl}
                alt="Current logo"
                className="h-10 max-w-[120px] object-contain rounded border border-zinc-200 bg-white p-1"
              />
            ) : (
              <div className="h-10 w-24 rounded border border-dashed border-zinc-300 flex items-center justify-center text-[11px] text-zinc-400">
                No logo
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={onFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {values.logoUrl ? "Replace" : "Upload"}
            </Button>
            {values.logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeLogo}
                className="gap-1.5 text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:items-start">
          <div>
            <label className="text-sm font-medium text-zinc-900 block mb-1.5">
              Accent color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(values.accentColor) ? values.accentColor : "#25d366"}
                onChange={(e) => {
                  setColorError(null);
                  update("accentColor", e.target.value);
                }}
                className="h-9 w-12 rounded border border-zinc-300 cursor-pointer disabled:cursor-not-allowed"
              />
              <input
                type="text"
                value={values.accentColor}
                onChange={(e) => {
                  setColorError(null);
                  update("accentColor", e.target.value.trim());
                }}
                maxLength={7}
                className="h-9 w-28 px-2 font-mono text-sm rounded-md border border-zinc-300 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
            {colorError && (
              <div className="text-xs text-red-600 mt-1">{colorError}</div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-900 block mb-1.5">
              Footer text (optional)
            </label>
            <input
              type="text"
              value={values.footerText ?? ""}
              onChange={(e) => update("footerText", e.target.value)}
              maxLength={200}
              placeholder="e.g. 555-1234 · hello@agency.com"
              className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="hideSwiftReach"
            type="checkbox"
            checked={values.hideSwiftReachBranding}
            onChange={(e) =>
              update("hideSwiftReachBranding", e.target.checked)
            }
            className="mt-1"
          />
          <label htmlFor="hideSwiftReach" className="text-sm text-zinc-700">
            Hide the &ldquo;Generated with SwiftReach&rdquo; line in the
            report footer
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={save}
          disabled={!canEdit || saving || uploading}
          className="gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save branding
        </Button>
        {!canEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => (window.location.href = "/billing")}
          >
            Upgrade to Pro
          </Button>
        )}
      </div>

    </div>
  );
}
