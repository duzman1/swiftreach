"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Step = 1 | 2;

type ConnState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; displayPhoneNumber?: string; verifiedName?: string }
  | { kind: "error"; message: string };

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);

  // Step 1 fields
  const [apiToken, setApiToken] = React.useState("");
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [businessAccountId, setBusinessAccountId] = React.useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = React.useState("");
  const [conn, setConn] = React.useState<ConnState>({ kind: "idle" });

  // Step 2 fields
  const [defaultCountryCode, setDefaultCountryCode] = React.useState("1");
  const [defaultDelayMs, setDefaultDelayMs] = React.useState(2000);
  const [saving, setSaving] = React.useState(false);

  async function testConnection() {
    if (!apiToken.trim() || !phoneNumberId.trim()) {
      setConn({ kind: "error", message: "Both Access Token and Phone Number ID are required." });
      return;
    }
    setConn({ kind: "loading" });
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken: apiToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConn({
          kind: "ok",
          displayPhoneNumber: data.displayPhoneNumber,
          verifiedName: data.verifiedName,
        });
      } else {
        setConn({
          kind: "error",
          message: `${data.code ? `[${data.code}] ` : ""}${data.error ?? "Unknown error"}`,
        });
      }
    } catch (err) {
      setConn({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function saveAndFinish() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappApiToken: apiToken.trim(),
          whatsappPhoneNumberId: phoneNumberId.trim(),
          whatsappBusinessAccountId: businessAccountId.trim() || null,
          webhookVerifyToken: webhookVerifyToken.trim() || null,
          defaultCountryCode,
          defaultDelayMs,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Setup complete — welcome to SwiftReach!");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  function skipForNow() {
    if (
      confirm(
        "Skip setup for now? You won't be able to send campaigns until you add your WhatsApp credentials in Settings."
      )
    ) {
      router.push("/");
      router.refresh();
    }
  }

  // ── Step 1 ─────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 1 of 2 — Connect your WhatsApp Business Account</CardTitle>
          <CardDescription>
            You&apos;ll find these on the Meta Developer dashboard.{" "}
            <Link
              href="https://developers.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-whatsapp hover:underline inline-flex items-center gap-1"
            >
              Open Meta Developer
              <ExternalLink className="w-3 h-3" />
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-token">Access Token</Label>
            <Input
              id="api-token"
              type="password"
              placeholder="EAARZADV..."
              value={apiToken}
              onChange={(e) => {
                setApiToken(e.target.value);
                setConn({ kind: "idle" });
              }}
              className="mt-1.5 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              From Meta Business Settings → System Users → Generate Token. Make
              sure you generated a permanent token (not a 24-hour one).
            </p>
          </div>

          <div>
            <Label htmlFor="phone-id">Phone Number ID</Label>
            <Input
              id="phone-id"
              placeholder="123456789012345"
              value={phoneNumberId}
              onChange={(e) => {
                setPhoneNumberId(e.target.value);
                setConn({ kind: "idle" });
              }}
              className="mt-1.5 font-mono text-xs"
            />
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
              placeholder="Any random string you choose"
              value={webhookVerifyToken}
              onChange={(e) => setWebhookVerifyToken(e.target.value)}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              You&apos;ll paste this same value into Meta&apos;s webhook
              configuration so Meta can prove it&apos;s talking to your account.
            </p>
          </div>

          <div className="pt-2 border-t">
            <Button
              type="button"
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

            {conn.kind === "ok" && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected!
                </div>
                {conn.displayPhoneNumber && (
                  <div className="text-xs mt-1">
                    Phone: <strong>{conn.displayPhoneNumber}</strong>
                    {conn.verifiedName && (
                      <>
                        {" "}
                        · Verified name: <strong>{conn.verifiedName}</strong>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {conn.kind === "error" && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="w-4 h-4" />
                  Connection failed
                </div>
                <div className="text-xs mt-1">{conn.message}</div>
              </div>
            )}
          </div>
        </CardContent>
        <div className="flex justify-between items-center px-6 pb-6 pt-2 border-t">
          <Button variant="ghost" onClick={skipForNow}>
            Skip for now
          </Button>
          <Button
            onClick={() => setStep(2)}
            disabled={conn.kind !== "ok"}
            className="gap-1"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    );
  }

  // ── Step 2 ─────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2 of 2 — Set your defaults</CardTitle>
        <CardDescription>
          These can be changed anytime in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="cc">Default country code</Label>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              +
            </span>
            <Input
              id="cc"
              inputMode="numeric"
              value={defaultCountryCode}
              onChange={(e) =>
                setDefaultCountryCode(e.target.value.replace(/\D/g, ""))
              }
              className="pl-6"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Prepended to 10-digit numbers in uploaded files.
          </p>
        </div>

        <div>
          <Label htmlFor="delay">
            Delay between messages: <strong>{(defaultDelayMs / 1000).toFixed(1)}s</strong>
          </Label>
          <input
            id="delay"
            type="range"
            min={1000}
            max={10000}
            step={500}
            value={defaultDelayMs}
            onChange={(e) => setDefaultDelayMs(Number(e.target.value))}
            className="w-full accent-whatsapp mt-1.5"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Recommended: 2s. Lower may trigger Meta rate limits.
          </p>
        </div>
      </CardContent>
      <div className="flex justify-between items-center px-6 pb-6 pt-2 border-t">
        <Button
          variant="ghost"
          onClick={() => setStep(1)}
          disabled={saving}
          className="gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={saveAndFinish} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Go to Dashboard
        </Button>
      </div>
    </Card>
  );
}

