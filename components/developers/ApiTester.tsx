"use client";

// Interactive API tester rendered on the public /developers page.
// Hits the real /api/webhooks/trigger endpoint from the browser so a
// developer can verify their key and payload without writing a curl
// command. Plain-key handling: we never store or log the value — it
// only ever lives in component state and is sent over HTTPS with the
// request.

import { useState } from "react";
import { Loader2, Send, AlertCircle, CheckCircle2 } from "lucide-react";

type Result = {
  status: number;
  ok: boolean;
  body: unknown;
  rateLimit?: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  };
};

export function ApiTester() {
  const [apiKey, setApiKey] = useState("");
  const [phone, setPhone] = useState("+");
  const [message, setMessage] = useState("Hello {{name}}! This is a test.");
  const [variables, setVariables] = useState('{\n  "name": "John"\n}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setClientError(null);
    setResult(null);

    // Pre-flight: parse variables JSON so the developer sees the
    // typo before we send anything over the wire.
    let parsedVars: Record<string, string> | undefined;
    const trimmed = variables.trim();
    if (trimmed.length > 0) {
      try {
        parsedVars = JSON.parse(trimmed);
        if (
          parsedVars === null ||
          typeof parsedVars !== "object" ||
          Array.isArray(parsedVars)
        ) {
          throw new Error("Variables must be a JSON object.");
        }
      } catch (err) {
        setClientError(
          `Variables JSON is invalid: ${
            err instanceof Error ? err.message : "parse error"
          }`
        );
        return;
      }
    }

    if (!apiKey.trim()) {
      setClientError("API key is required.");
      return;
    }
    if (!phone.trim() || phone.trim() === "+") {
      setClientError("Phone number is required.");
      return;
    }
    if (!message.trim()) {
      setClientError("Message is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/webhooks/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          phone: phone.trim(),
          message: message.trim(),
          ...(parsedVars ? { variables: parsedVars } : {}),
        }),
      });

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = { error: "Response was not valid JSON." };
      }

      setResult({
        status: res.status,
        ok: res.ok,
        body,
        rateLimit: {
          limit: res.headers.get("X-RateLimit-Limit"),
          remaining: res.headers.get("X-RateLimit-Remaining"),
          reset: res.headers.get("X-RateLimit-Reset"),
        },
      });
    } catch (err) {
      setClientError(
        `Network error: ${err instanceof Error ? err.message : "unknown"}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="API Key"
          hint="Starts with sr_live_… Get one at /settings/api-keys."
          required
        >
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sr_live_..."
            className="w-full font-mono text-sm rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
            autoComplete="off"
          />
        </Field>

        <Field label="Phone" hint="International format, e.g. +13103459139" required>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+13103459139"
            className="w-full font-mono text-sm rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
          />
        </Field>

        <Field
          label="Message"
          hint="Use {{variable}} placeholders. Replaced from Variables below."
          required
        >
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full text-sm rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
          />
        </Field>

        <Field
          label="Variables (JSON)"
          hint="Optional. Must be a flat object of string values."
        >
          <textarea
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            rows={4}
            className="w-full font-mono text-xs rounded-md border border-zinc-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-whatsapp/40"
            spellCheck={false}
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-whatsapp hover:bg-whatsapp-dark disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Test Message
            </>
          )}
        </button>
      </form>

      {clientError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{clientError}</span>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {result.ok ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-emerald-700">
                  {result.status} Success
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="font-semibold text-red-700">
                  {result.status} {result.status === 429 ? "Rate limited" : "Failed"}
                </span>
              </>
            )}
          </div>

          {result.rateLimit &&
            (result.rateLimit.limit || result.rateLimit.remaining) && (
              <div className="text-xs text-zinc-500 font-mono">
                X-RateLimit-Limit: {result.rateLimit.limit ?? "—"} ·{" "}
                X-RateLimit-Remaining: {result.rateLimit.remaining ?? "—"} ·{" "}
                X-RateLimit-Reset: {result.rateLimit.reset ?? "—"}
              </div>
            )}

          <div className="rounded-md border border-zinc-200 bg-zinc-900 text-zinc-100 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 border-b border-zinc-700">
              Response
            </div>
            <pre className="px-3 py-3 overflow-x-auto text-xs font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-semibold text-zinc-800">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </label>
  );
}
