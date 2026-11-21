// CSP violation collector.
//
// Browsers POST here when a Content-Security-Policy-Report-Only header
// would have blocked a resource. We log to the existing ErrorLog so
// violations surface in the same place every other server-side error
// does, and the admin dashboard can show counts without extra plumbing.
//
// Two body shapes land here, depending on the browser's reporting
// generation:
//
//  1. Legacy `application/csp-report`
//     { "csp-report": { "document-uri", "violated-directive",
//                       "blocked-uri", "source-file", "line-number",
//                       "script-sample", ... } }
//     — still the default Chrome sends for `report-uri` directives.
//
//  2. Modern Reporting API `application/reports+json`
//     [ { "type": "csp-violation", "body": { ... }, "url": "...",
//         "age": ..., "user_agent": "..." } ]
//     — sent for `report-to` directives.
//
// We normalise both into a single flat shape before logging so the
// log searches read the same.
//
// Rate limit: a misconfigured policy can produce hundreds of reports
// per page load. We hard-cap body size and per-IP frequency so a
// hostile page can't flood the log table. If we exceed the cap we
// silently 204 — the browser doesn't retry report-only submissions,
// so there's no cost to the user.

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keep well below Vercel's request body cap. A single violation
// report is typically < 2 KB; anything larger is almost certainly an
// attempt to abuse the endpoint.
const MAX_BODY_BYTES = 16 * 1024;

// Per-IP cap to avoid log flooding. One normal page can generate a
// handful; a thousand/min from the same IP is noise or abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 50;
const buckets = new Map<string, { count: number; resetAt: number }>();

function underRateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count++;
  return true;
}

interface NormalisedReport {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  scriptSample?: string;
  disposition?: string;
  userAgent?: string;
}

function normalise(raw: unknown, userAgent: string): NormalisedReport[] {
  if (!raw || typeof raw !== "object") return [];

  // Reporting API shape: an array of {type, body, ...}
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (r): r is { type?: string; body?: Record<string, unknown>; user_agent?: string } =>
          r && typeof r === "object"
      )
      .filter((r) => (r.type ?? "").toString().includes("csp"))
      .map((r) => {
        const b = (r.body ?? {}) as Record<string, unknown>;
        return {
          documentUri: str(b.documentURL) ?? str(b["document-uri"]),
          violatedDirective: str(b.effectiveDirective) ?? str(b["violated-directive"]),
          effectiveDirective: str(b.effectiveDirective) ?? str(b["effective-directive"]),
          blockedUri: str(b.blockedURL) ?? str(b["blocked-uri"]),
          sourceFile: str(b.sourceFile) ?? str(b["source-file"]),
          lineNumber: num(b.lineNumber) ?? num(b["line-number"]),
          scriptSample: str(b.sample) ?? str(b["script-sample"]),
          disposition: str(b.disposition),
          userAgent: r.user_agent ?? userAgent,
        };
      });
  }

  // Legacy report-uri shape: { "csp-report": { ... } }
  const r = raw as { "csp-report"?: Record<string, unknown> };
  if (r["csp-report"]) {
    const b = r["csp-report"];
    return [
      {
        documentUri: str(b["document-uri"]),
        violatedDirective: str(b["violated-directive"]),
        effectiveDirective: str(b["effective-directive"]),
        blockedUri: str(b["blocked-uri"]),
        sourceFile: str(b["source-file"]),
        lineNumber: num(b["line-number"]),
        scriptSample: str(b["script-sample"]),
        disposition: str(b.disposition),
        userAgent,
      },
    ];
  }

  return [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export async function POST(req: NextRequest) {
  // Vercel's edge-forwarded client IP. Fallback keeps the limiter
  // honest when the header is missing (localhost, custom proxies).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!underRateLimit(ip)) {
    return new NextResponse(null, { status: 204 });
  }

  // Cap the payload before parsing. Content-Length isn't guaranteed
  // present but when it is we can short-circuit.
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // Browsers occasionally send empty bodies — nothing to do.
    return new NextResponse(null, { status: 204 });
  }

  const userAgent = req.headers.get("user-agent") ?? "";
  const reports = normalise(raw, userAgent);

  for (const r of reports) {
    // logError only takes {userId, severity}; no structured-context
    // field. Embed the report as JSON in the Error message so a grep
    // over the ErrorLog surfaces every field (document uri, blocked
    // uri, directive, source file:line, script sample). Severity is
    // "warning" — we want CSP noise visible in the admin dashboard
    // but not pageable as a regular error.
    try {
      await logError(
        "csp-report-only",
        new Error(
          `CSP ${r.disposition ?? "report"}: ${r.violatedDirective ?? "?"} blocked ${r.blockedUri ?? "?"} :: ` +
            JSON.stringify({
              documentUri: r.documentUri,
              violatedDirective: r.violatedDirective,
              effectiveDirective: r.effectiveDirective,
              blockedUri: r.blockedUri,
              sourceFile: r.sourceFile,
              lineNumber: r.lineNumber,
              scriptSample: r.scriptSample,
              userAgent: r.userAgent,
              ip,
            })
        ),
        { severity: "warning" }
      );
    } catch {
      // Report-collection failure must never bubble up — browsers
      // treat a 5xx on report submission as a signal to retry, which
      // multiplies load during a misconfig. Swallow and move on.
    }
  }

  // Always return 204: browsers neither need nor want a response body.
  return new NextResponse(null, { status: 204 });
}
