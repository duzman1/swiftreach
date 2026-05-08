"use client";

import * as React from "react";
import {
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Plug,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ServerSettings {
  whatsappConnected: boolean;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappApiVersion: string;
  webhookVerifyToken: string;
  whatsappApiTokenMasked: string; // "•••••" if a token is set, "" otherwise
  defaultCountryCode: string;
  defaultDelayMs: number;
}

type ConnState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      displayPhoneNumber?: string;
      verifiedName?: string;
      qualityRating?: string;
    }
  | { kind: "error"; message: string; code?: string | number };

export function WhatsAppCredentialsForm() {
  const [server, setServer] = React.useState<ServerSettings | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [showTokenField, setShowTokenField] = React.useState(false);

  // Editable mirror — `apiToken` is local-only; we never echo what the server has.
  const [apiToken, setApiToken] = React.useState("");
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [businessAccountId, setBusinessAccountId] = React.useState("");
  const [apiVersion, setApiVersion] = React.useState("v25.0");
  const [verifyToken, setVerifyToken] = React.useState("");

  const [saving, setSaving] = React.useState(false);
  const [conn, setConn] = React.useState<ConnState>({ kind: "idle" });

  // Load server state
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/settings");
        const data = await res.json();
        if (data.ok) {
          setServer(data.settings);
          setPhoneNumberId(data.settings.whatsappPhoneNumberId ?? "");
          setBusinessAccountId(data.settings.whatsappBusinessAccountId ?? "");
          setApiVersion(data.settings.whatsappApiVersion ?? "v25.0");
          setVerifyToken(data.settings.webhookVerifyToken ?? "");
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Empty apiToken means "leave existing alone" per the API contract.
      const body: Record<string, unknown> = {
        whatsappPhoneNumberId: phoneNumberId.trim() || null,
        whatsappBusinessAccountId: businessAccountId.trim() || null,
        whatsappApiVersion: apiVersion.trim() || "v25.0",
        webhookVerifyToken: verifyToken.trim() || null,
      };
      if (apiToken.trim()) {
        body.whatsappApiToken = apiToken.trim();
      }
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Credentials saved");
      setServer(data.settings);
      setApiToken(""); // clear the input — token is now in DB
      setShowTokenField(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setConn({ kind: "loading" });
    try {
      // Unsaved token in the field? Test that one. Otherwise test what's saved.
      const body: Record<string, string> = {};
      if (apiToken.trim() && phoneNumberId.trim()) {
        body.apiToken = apiToken.trim();
        body.phoneNumberId = phoneNumberId.trim();
        if (apiVersion.trim()) body.apiVersion = apiVersion.trim();
      }
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setConn({
          kind: "ok",
          displayPhoneNumber: data.displayPhoneNumber,
          verifiedName: data.verifiedName,
          qualityRating: data.qualityRating,
        });
      } else {
        setConn({
          kind: "error",
          message: data.error ?? "Unknown error",
          code: data.code,
        });
      }
    } catch (err) {
      setConn({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground py-3">Loading credentials…</p>;
  }

  const tokenIsSet = Boolean(server?.whatsappApiTokenMasked);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {server?.whatsappConnected ? (
          <Badge variant="success">Configured</Badge>
        ) : (
          <Badge variant="warning">Not configured</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          Stored encrypted in your account.
        </span>
      </div>

      <div>
        <Label htmlFor="api-token">Access Token</Label>
        {tokenIsSet && !showTokenField ? (
          <div className="flex items-center gap-2 mt-1.5">
            <code className="text-xs bg-zinc-100 px-3 py-2 rounded flex-1 font-mono">
              ••••••••••••••••••••
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTokenField(true)}
              className="gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              Replace
            </Button>
          </div>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <Input
              id="api-token"
              type="password"
              placeholder="EAARZADV..."
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="font-mono text-xs"
            />
            {tokenIsSet && (
              <button
                type="button"
                onClick={() => {
                  setShowTokenField(false);
                  setApiToken("");
                }}
                className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
              >
                <EyeOff className="w-3 h-3" />
                Cancel — keep existing token
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone-id">Phone Number ID</Label>
          <Input
            id="phone-id"
            placeholder="123456789012345"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            className="mt-1.5 font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="api-version">API Version</Label>
          <Input
            id="api-version"
            placeholder="v25.0"
            value={apiVersion}
            onChange={(e) => setApiVersion(e.target.value)}
            className="mt-1.5 font-mono text-xs"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="waba-id">Business Account ID</Label>
        <Input
          id="waba-id"
          placeholder="123456789012345"
          value={businessAccountId}
          onChange={(e) => setBusinessAccountId(e.target.value)}
          className="mt-1.5 font-mono text-xs"
        />
      </div>

      <div>
        <Label htmlFor="verify-token">Webhook Verify Token</Label>
        <Input
          id="verify-token"
          placeholder="Any random string"
          value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value)}
          className="mt-1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Paste this same value into Meta&apos;s webhook configuration.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={conn.kind === "loading"}
          className="gap-2"
        >
          {conn.kind === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plug className="w-4 h-4" />
          )}
          Test Connection
        </Button>
      </div>

      {conn.kind === "ok" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Connection successful
          </div>
          {conn.displayPhoneNumber && (
            <div className="text-xs">Phone: <strong>{conn.displayPhoneNumber}</strong></div>
          )}
          {conn.verifiedName && (
            <div className="text-xs">Verified name: <strong>{conn.verifiedName}</strong></div>
          )}
          {conn.qualityRating && (
            <div className="text-xs">Quality rating: <strong>{conn.qualityRating}</strong></div>
          )}
        </div>
      )}

      {conn.kind === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <XCircle className="w-4 h-4" />
            Connection failed
          </div>
          <div className="text-xs">
            {conn.code ? <span className="font-mono">[{conn.code}] </span> : null}
            {conn.message}
          </div>
        </div>
      )}
    </div>
  );
}
