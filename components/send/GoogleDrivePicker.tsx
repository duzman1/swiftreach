"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cloud, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SheetPicker } from "./SheetPicker";
import type { ParsedFile, SheetMeta } from "@/lib/parseFile";

const PAID_PLANS = ["starter", "growth"];

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
const MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const ALLOWED_MIMES = [
  MIME_GOOGLE_SHEET,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");

interface Props {
  onParsed: (parsed: ParsedFile) => void;
}

// Sheet selection payload returned by /api/drive/import or /api/drive/sheets
// when the picked file has multiple non-empty tabs. We re-use the local
// SheetMeta shape — server is responsible for normalising rowCount/isEmpty
// for Excel; for Google Sheets we fill them in here with placeholders that
// the picker UI still renders sensibly.
interface RemoteSheet {
  id: number;
  name: string;
  index: number;
  rowCount?: number;
  isEmpty?: boolean;
}

interface SheetSelectionState {
  fileId: string;
  fileName: string;
  mimeType: string;
  accessToken: string;
  sheets: RemoteSheet[];
  defaultSheetIndex?: number;
}

type Phase =
  | "idle"
  | "connecting"
  | "downloading"
  | "sheet_selection"
  | "error";

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
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [activeName, setActiveName] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<SheetSelectionState | null>(
    null
  );
  const tokenClientRef = React.useRef<TokenClient | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";

  // Plan is fetched on mount and cached in state. The button's onClick
  // checks PAID_PLANS BEFORE doing anything else — see start(). Same
  // shape as the rest of the app: GET /api/billing/status returns
  // { ok, plan } at the top level. Fall back to 'free' on any error
  // so the gate fails closed.
  const [userPlan, setUserPlan] = React.useState<string | null>(null);
  React.useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setUserPlan(d?.plan || "free"))
      .catch(() => setUserPlan("free"));
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

  // Drive import call. `selectedSheet` is set when the user picks a tab
  // from the in-app SheetPicker (re-call after a needsSheetSelection
  // response).
  async function importFile(
    doc: DriveDoc,
    accessToken: string,
    selectedSheet?: { name?: string; index?: number }
  ) {
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
          ...(selectedSheet?.name ? { sheetName: selectedSheet.name } : {}),
          ...(typeof selectedSheet?.index === "number"
            ? { sheetIndex: selectedSheet.index }
            : {}),
        }),
      });
      const data = await res.json();

      if (res.status === 403) {
        const target =
          (typeof data.redirectTo === "string" && data.redirectTo) ||
          "/billing?feature=google-drive-import";
        router.push(target);
        setPhase("idle");
        return;
      }

      // Multi-sheet branch — server is asking the user to pick a tab.
      if (data.ok && data.needsSheetSelection) {
        setSelection({
          fileId: doc.id,
          fileName: doc.name,
          mimeType: doc.mimeType,
          accessToken,
          sheets: data.sheets as RemoteSheet[],
          defaultSheetIndex: data.defaultSheetIndex,
        });
        setPhase("sheet_selection");
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
      setSelection(null);
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

  async function start() {
    // Plan gate FIRST — before touching Google credentials, the picker
    // SDK, or anything else. Free (and unknown / still-loading) users
    // get redirected to /billing with the feature query param so the
    // billing page can show context. The server route /api/drive/import
    // also rechecks, so devtools / curl can't bypass.
    if (!PAID_PLANS.includes(userPlan?.toLowerCase() ?? "free")) {
      router.push("/billing?feature=google-drive-import");
      return;
    }
    if (!clientId || !apiKey) {
      setError("Google credentials not configured.");
      setPhase("error");
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

  // ── Sheet picker view ─────────────────────────────────────────────────
  if (phase === "sheet_selection" && selection) {
    const isGoogleSheet = selection.mimeType === MIME_GOOGLE_SHEET;
    // Map remote sheet payload onto SheetMeta. For Google Sheets we
    // don't have a real data-row count (the Sheets API only gives a
    // grid dimension), so rowCount is shown as a dash via -1 sentinel.
    const sheetMetas: SheetMeta[] = selection.sheets.map((s) => ({
      name: s.name,
      index: s.index,
      rowCount: s.rowCount ?? -1,
      isEmpty: s.isEmpty ?? false,
    }));
    const defaultIdx =
      typeof selection.defaultSheetIndex === "number"
        ? selection.defaultSheetIndex
        : sheetMetas.find((s) => !s.isEmpty)?.index ?? 0;

    return (
      <SheetPicker
        fileName={selection.fileName}
        sheets={sheetMetas}
        defaultSheetIndex={defaultIdx}
        onConfirm={(idx) => {
          const chosen = selection.sheets.find((s) => s.index === idx);
          if (!chosen) return;
          // Google Sheets values endpoint is name-keyed; Excel parsing
          // is index-keyed. Send whichever the backend needs.
          void importFile(
            {
              id: selection.fileId,
              name: selection.fileName,
              mimeType: selection.mimeType,
            },
            selection.accessToken,
            isGoogleSheet
              ? { name: chosen.name }
              : { index: chosen.index }
          );
        }}
        onCancel={() => {
          setSelection(null);
          setPhase("idle");
        }}
        loading={false}
      />
    );
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
        onClick={() => void start()}
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
    </div>
  );
}
