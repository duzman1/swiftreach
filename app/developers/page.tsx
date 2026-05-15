// Public API documentation. Lives outside any auth gate (added to
// middleware.ts public routes) so a developer evaluating SwiftReach
// can read the API surface without an account. The interactive
// tester at the bottom hits the real /api/webhooks/trigger endpoint
// from the browser.

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ApiTester } from "@/components/developers/ApiTester";

export const metadata: Metadata = {
  title: "Developers — SwiftReach API",
  description:
    "Connect SwiftReach to Zapier, Make, n8n, or any app using our webhook API. Send personalized WhatsApp messages with a single REST call.",
};

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Header — same SwiftReach mark as the marketing landing. */}
      <header className="px-6 md:px-10 py-5 border-b border-zinc-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt="SwiftReach"
              width={140}
              height={40}
              className="object-contain"
              priority
            />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              Sign In
            </Link>
            <Link
              href="/settings/api-keys"
              className="px-3 py-1.5 rounded-md bg-whatsapp text-white hover:bg-whatsapp-dark"
            >
              Get Your API Key
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 md:px-10 py-12 space-y-16">
        {/* HERO */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            SwiftReach API
          </h1>
          <p className="text-lg text-zinc-600 max-w-2xl mx-auto leading-relaxed">
            Send personalized WhatsApp messages from any app. Connect
            Zapier, Make, n8n, or build your own integration.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/settings/api-keys">
              <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-whatsapp hover:bg-whatsapp-dark text-white font-semibold text-sm">
                Get Your API Key
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </section>

        {/* QUICK START */}
        <Section title="Quick Start" subtitle="Send your first message in 60 seconds.">
          <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
            <li>
              Get your API key at{" "}
              <Link href="/settings/api-keys" className="text-whatsapp hover:underline">
                swiftreach.app/settings/api-keys
              </Link>
              .
            </li>
            <li>Make a POST request:</li>
          </ol>

          <CodeBlock label="cURL">{CURL_QUICKSTART}</CodeBlock>

          <p className="text-sm text-zinc-600 mt-4">Response:</p>
          <CodeBlock label="JSON">{`{
  "success": true,
  "message_id": "wamid.abc123...",
  "phone": "13103459139",
  "type": "freeform",
  "rate_limit": {
    "limit": 1000,
    "remaining": 999,
    "reset_at": "2026-05-15T00:00:00.000Z"
  }
}`}</CodeBlock>
        </Section>

        {/* API REFERENCE */}
        <Section title="API Reference">
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            POST <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-base">/api/webhooks/trigger</code>
          </h3>

          <p className="text-sm font-semibold text-zinc-900 mt-4">Authentication</p>
          <p className="text-sm text-zinc-700 mt-1">
            Send your key in one of three ways:
          </p>
          <ul className="list-disc pl-6 text-sm text-zinc-700 mt-1 space-y-1">
            <li><code className="bg-zinc-100 px-1 rounded">Authorization: Bearer sr_live_...</code> (recommended)</li>
            <li><code className="bg-zinc-100 px-1 rounded">X-API-Key: sr_live_...</code></li>
            <li><code className="bg-zinc-100 px-1 rounded">api_key</code> in the JSON body</li>
          </ul>

          <p className="text-sm font-semibold text-zinc-900 mt-6">Request body</p>
          <FieldTable
            rows={[
              ["phone", "string", "required", "Phone in international format. Non-digits are stripped."],
              ["message", "string", "required if no template", "Message text. Use {{variable}} placeholders."],
              ["template", "string", "required if no message", "Meta-approved template name."],
              ["variables", "object", "optional", "Key-value pairs for placeholders."],
              ["language", "string", "optional", "Template language code. Defaults to en_US."],
              ["api_key", "string", "optional", "Alternative to Authorization header."],
            ]}
          />

          <p className="text-sm font-semibold text-zinc-900 mt-6">Response fields</p>
          <FieldTable
            rows={[
              ["success", "boolean", "", "true on send, false otherwise."],
              ["message_id", "string", "", "WhatsApp message id (use for delivery tracking)."],
              ["phone", "string", "", "Normalized phone number used."],
              ["type", "string", "", '"freeform" or "template".'],
              ["rate_limit", "object", "", "Current limit status."],
              ["error", "string", "on failure", "Plain-English error message."],
              ["details", "object", "on failure", "Additional error context (Meta code, etc.)."],
            ]}
          />
        </Section>

        {/* EXAMPLES */}
        <Section title="Examples">
          <p className="text-sm text-zinc-700 mb-2">Free-form message with variables:</p>
          <CodeBlock label="cURL">{`curl -X POST https://www.swiftreach.app/api/webhooks/trigger \\
  -H "Authorization: Bearer sr_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+13103459139",
    "message": "Good day {{salutation}} {{name}}! Your balance of \${{balance}} is due on {{date}}.",
    "variables": {
      "salutation": "Sir",
      "name": "John Agada",
      "balance": "150",
      "date": "June 1, 2026"
    }
  }'`}</CodeBlock>

          <p className="text-sm text-zinc-700 mt-6 mb-2">Template message:</p>
          <CodeBlock label="cURL">{`curl -X POST https://www.swiftreach.app/api/webhooks/trigger \\
  -H "Authorization: Bearer sr_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+13103459139",
    "template": "meeting_reminder",
    "language": "en_US",
    "variables": {
      "1": "Sir",
      "2": "Sunday May 18",
      "3": "150"
    }
  }'`}</CodeBlock>
        </Section>

        {/* ERROR REFERENCE */}
        <Section title="Error Reference">
          <FieldTable
            rows={[
              ["131030", "Phone number not on Meta test recipient list", "Add the recipient at developers.facebook.com → your app → WhatsApp → Getting Started, or move your Meta app to Live mode."],
              ["131047", "24-hour session window expired", "Send a template instead, or wait until the contact messages you again."],
              ["131026", "Phone number not on WhatsApp", "Confirm the number is registered on WhatsApp."],
              ["131021", "Invalid phone number format", "Use E.164 international format: +13103459139"],
              ["100", "Invalid credentials", "Reconnect WhatsApp in SwiftReach Settings."],
              ["190", "Token expired", "Reconnect via /onboarding."],
              ["80007", "Meta rate limit", "Wait a few minutes and retry."],
            ]}
            headers={["Code", "Meaning", "How to fix"]}
          />
        </Section>

        {/* RATE LIMITS */}
        <Section title="Rate Limits">
          <p className="text-sm text-zinc-700 mb-3">
            Limits are per user per 24-hour rolling window.
          </p>
          <FieldTable
            rows={[
              ["Free", "—", "No API access"],
              ["Starter", "100", "100 requests / day"],
              ["Growth", "1,000", "1,000 requests / day"],
              ["Pro", "10,000", "10,000 requests / day"],
            ]}
            headers={["Plan", "Daily Limit", "Notes"]}
          />
          <p className="text-sm text-zinc-700 mt-4">
            Every response includes rate-limit headers:
          </p>
          <ul className="list-disc pl-6 text-sm text-zinc-700 mt-1 space-y-1">
            <li><code className="bg-zinc-100 px-1 rounded">X-RateLimit-Limit</code> — your daily cap</li>
            <li><code className="bg-zinc-100 px-1 rounded">X-RateLimit-Remaining</code> — requests left in the current window</li>
            <li><code className="bg-zinc-100 px-1 rounded">X-RateLimit-Reset</code> — Unix seconds when the window resets</li>
            <li><code className="bg-zinc-100 px-1 rounded">Retry-After</code> — present on 429s, seconds until you can retry</li>
          </ul>
        </Section>

        {/* ZAPIER */}
        <Section title="Zapier &amp; Make Integration" subtitle="🔗 Connect SwiftReach to your existing automations">
          <ol className="list-decimal pl-6 space-y-2 text-sm text-zinc-700">
            <li>
              Create an API key at{" "}
              <Link href="/settings/api-keys" className="text-whatsapp hover:underline">
                /settings/api-keys
              </Link>
              .
            </li>
            <li>
              In Zapier / Make / n8n, add a <strong>Webhook → POST</strong> step
              with URL <code className="bg-zinc-100 px-1 rounded">https://www.swiftreach.app/api/webhooks/trigger</code>.
            </li>
            <li>
              Add header <code className="bg-zinc-100 px-1 rounded">Authorization: Bearer sr_live_...</code>.
            </li>
            <li>
              Map your trigger&apos;s fields into the JSON body (phone, message
              or template, variables).
            </li>
          </ol>
          <p className="text-sm text-zinc-700 mt-4">Popular flows:</p>
          <ul className="list-disc pl-6 text-sm text-zinc-700 mt-1 space-y-1">
            <li>Google Forms → SwiftReach (welcome message)</li>
            <li>Stripe → SwiftReach (payment confirmation)</li>
            <li>Calendly → SwiftReach (booking reminder)</li>
            <li>Google Sheets new row → SwiftReach (drip sequence)</li>
          </ul>
        </Section>

        {/* TESTER */}
        <Section title="Test the API right here">
          <p className="text-sm text-zinc-600 mb-4">
            Paste your key and a phone number, then send a real message.
            Uses the exact endpoint your integrations will hit.
          </p>
          <ApiTester />
        </Section>

        <footer className="pt-12 mt-8 border-t border-zinc-200 text-sm text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 SwiftReach · support@swiftreach.app</span>
          <nav className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-zinc-900">Privacy</Link>
            <span className="text-zinc-300">·</span>
            <Link href="/terms" className="hover:text-zinc-900">Terms</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-1">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-zinc-500 mb-4">{subtitle}</p>
      )}
      <div className="text-zinc-700 leading-relaxed">{children}</div>
    </section>
  );
}

function CodeBlock({
  label,
  children,
}: {
  label?: string;
  children: string;
}) {
  return (
    <div className="my-3 rounded-md border border-zinc-200 bg-zinc-900 text-zinc-100 overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 border-b border-zinc-700">
          {label}
        </div>
      )}
      <pre className="px-3 py-3 overflow-x-auto text-xs font-mono whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

function FieldTable({
  rows,
  headers,
}: {
  rows: string[][];
  headers?: string[];
}) {
  const hdr = headers ?? ["Field", "Type", "Required", "Notes"];
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {hdr.map((h) => (
              <th key={h} className="px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 ${
                    j === 0 ? "font-mono text-xs text-zinc-800" : "text-zinc-700"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CURL_QUICKSTART = `curl -X POST https://www.swiftreach.app/api/webhooks/trigger \\
  -H "Authorization: Bearer sr_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+13103459139",
    "message": "Hello {{name}}! Your appointment is tomorrow.",
    "variables": {
      "name": "John"
    }
  }'`;
