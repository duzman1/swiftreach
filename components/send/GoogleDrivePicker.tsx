"use client";

import * as React from "react";
import Link from "next/link";
import { Cloud, Loader2, FileSpreadsheet, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ParsedFile } from "@/lib/parseFile";

// Minimal type stubs for the runtime-loaded Google globals so we don't need
// the full @types/google.picker / @types/gapi dependency chain.
interface DriveDoc {
  id: string;
  name: string;
  mimeType: string;
}
interface PickerData {
  action: string;
  docs?: DriveDoc[];
}
interface TokenClient {
  callback: (resp: { access_token?: string; error?: string }) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
interface GapiGlobal {
  load: (
    api: string,
    cb: { callback: () => void; onerror?: (e: unknown) => void }
  ) => void;
}
interface GoogleGlobal {
  picker: {
    PickerBuilder: new () => PickerBuilderType;
    DocsView: new () => DocsViewType;
    Action: { PICKED: string; CANCEL: string };
    ViewId: { DOCS: string };
  };
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }) => TokenClient;
    };
  };
}
interface DocsViewType {
  setMimeTypes(s: string): DocsViewType;
  setIncludeFolders(b: boolean): DocsViewType;
}
interface PickerBuilderType {
  addView(v: DocsViewType): PickerBuilderType;
  setTitle(s: string): PickerBuilderType;
  setOAuthToken(s: string): PickerBuilderType;
  setDeveloperKey(s: string): PickerBuilderType;
  setLocale(s: string): PickerBuilderType;
  setCallback(cb: (data: PickerData) => void): PickerBuilderType;
  build(): { setVisible(b: boolean): void };
}

declare global {
  interface Window {
    gapi?: GapiGlobal;
    google?: GoogleGlobal;
  }
}

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const ALLOWED_MIMES = [
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");

interface Props {
  onParsed: (parsed: ParsedFile) => void;
}

type Phase = "idle" | "connecting" | "downloading" | "error";

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-loaded="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.loaded = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function GoogleDrivePicker({ onParsed }: Props) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [activeName, setActiveName] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = React.useState(false);
  const tokenClientRef = React.useRef<TokenClient | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";

  // Cached plan — null while loading, then "free" / "starter" / "growth".
  // We don't block the button render on this; we check at click time.
  const [plan, setPlan] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok && typeof j.plan === "string") setPlan(j.plan);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureLoaded = React.useCallback(async () => {
    await loadScriptOnce("https://apis.google.com/js/api.js");
    await new Promise<void>((resolve, reject) => {
      if (!window.gapi) return reject(new Error("gapi missing after load"));
      window.gapi.load("picker", {
        callback: () => resolve(),
        onerror: (e) => reject(e),
      });
    });
    await loadScriptOnce("https://accounts.google.com/gsi/client");
  }, []);

  async function importFile(doc: DriveDoc, accessToken: string) {
    setPhase("downloading");
    setActiveName(doc.name);
    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: doc.id,
          fileName: doc.name,
          mimeType: doc.mimeType,
          accessToken,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.upgradeRequired) {
        setUpgradeModalOpen(true);
        setPhase("idle");
        return;
      }
      if (!data.ok) {
        const msg: string = data.error ?? "Import failed";
        setError(msg);
        toast.error(`Drive import failed: ${msg}`);
        setPhase("error");
        return;
      }
      toast.success(`Imported "${doc.name}" from Google Drive`);
      onParsed(data.parsed as ParsedFile);
      setPhase("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      toast.error(`Drive import failed: ${msg}`);
      setPhase("error");
    }
  }

  function openPicker(accessToken: string) {
    if (!window.google?.picker) {
      setError("Google Picker is not available. Try again.");
      setPhase("error");
      return;
    }
    const view = new window.google.picker.DocsView()
      .setMimeTypes(ALLOWED_MIMES)
      .setIncludeFolders(false);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setTitle("Select your contact list")
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setLocale("en")
      .setCallback((data) => {
        if (
          data.action === window.google!.picker.Action.PICKED &&
          data.docs &&
          data.docs[0]
        ) {
          void importFile(data.docs[0], accessToken);
        } else if (data.action === window.google!.picker.Action.CANCEL) {
          setPhase("idle");
        }
      })
      .build();
    picker.setVisible(true);
  }

  async function checkPlan(): Promise<"free" | "paid"> {
    // Use cached plan if available — saves a roundtrip. Refetch only when
    // we have no cached value yet (component just mounted).
    if (plan) return plan === "free" ? "free" : "paid";
    try {
      const r = await fetch("/api/billing/status");
      const j = await r.json();
      if (j.ok && typeof j.plan === "string") {
        setPlan(j.plan);
        return j.plan === "free" ? "free" : "paid";
      }
    } catch {
      // Network error — treat as free to be safe. Server route will
      // re-check and 403 anyway.
      return "free";
    }
    return "free";
  }

  async function start() {
    if (!clientId || !apiKey) {
      setError("Google credentials not configured.");
      setPhase("error");
      return;
    }
    // Plan gate. Free users see the upgrade modal instead of the picker.
    // The /api/drive/import route also rechecks server-side — this is the
    // friendlier user-facing block.
    const tier = await checkPlan();
    if (tier === "free") {
      setUpgradeModalOpen(true);
      return;
    }
    setError(null);
    setPhase("connecting");
    try {
      await ensureLoaded();
      if (!tokenClientRef.current) {
        if (!window.google?.accounts?.oauth2) {
          throw new Error("Google Identity Services failed to load.");
        }
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: () => undefined, // overridden per-request below
        });
      }
      const accessToken = await new Promise<string>((resolve, reject) => {
        tokenClientRef.current!.callback = (resp) => {
          if (resp.error) reject(new Error(resp.error));
          else if (!resp.access_token) reject(new Error("No access token returned"));
          else resolve(resp.access_token);
        };
        tokenClientRef.current!.requestAccessToken({ prompt: "" });
      });
      openPicker(accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect to Google";
      setError(msg);
      setPhase("error");
    }
  }

  const busy = phase === "connecting" || phase === "downloading";

  let buttonText: string;
  if (phase === "connecting") buttonText = "Connecting to Google...";
  else if (phase === "downloading") buttonText = `Importing ${activeName}...`;
  else buttonText = "Pick from Drive";

  return (
    <div className="border-2 border-dashed rounded-md p-10 text-center transition-colors border-zinc-300">
      <FileSpreadsheet className="w-8 h-8 mx-auto text-zinc-400 mb-3" />
      <div className="font-medium text-sm">Import from Google Drive</div>
      <div className="text-xs text-muted-foreground mt-1 mb-3">
        Pick a Google Sheet, Excel, or CSV from your Drive.
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setError(null);
          if (phase === "error") setPhase("idle");
          void start();
        }}
        disabled={busy}
        className="gap-2"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Cloud className="w-4 h-4" />
        )}
        {buttonText}
      </Button>

      {error && phase === "error" && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 text-left">
          {error}
        </div>
      )}

      {upgradeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setUpgradeModalOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-700" />
              <h3 className="text-lg font-semibold">Google Drive Import</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Google Drive import is available on Starter and Growth plans.
            </p>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                Upgrade to unlock
              </div>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  Import directly from Google Sheets
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  Import Excel files from Drive
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  Save contacts to your Contact Book
                </li>
              </ul>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                onClick={() => setUpgradeModalOpen(false)}
                className="sm:flex-none"
              >
                Cancel
              </Button>
              <Link
                href="/billing"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors"
              >
                Upgrade to Starter — $29/mo →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
