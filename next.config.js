/** @type {import('next').NextConfig} */

// App brand metadata. Next.js doesn't read HTML <title> / <meta> tags from
// next.config.js itself — those are produced by the Metadata API in
// app/layout.tsx. This block exists so the brand info has a single,
// build-visible source: it's exposed to runtime via env vars below.
const APP_METADATA = {
  title: "SwiftReach",
  description:
    "Create, send, and track compliant WhatsApp Business campaigns for opted-in customers. Upload contacts, build reusable message templates, and monitor delivery in real time.",
};

const nextConfig = {
  reactStrictMode: true,
  // Suppresses the X-Powered-By: Next.js header. Pure fingerprint
  // hygiene — attackers already know what we're running from HTML
  // shape + Vercel's response patterns, but there's no reason to
  // advertise the framework version in a header either.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_NAME: APP_METADATA.title,
    NEXT_PUBLIC_APP_DESCRIPTION: APP_METADATA.description,
  },

  // Required for Prisma on Vercel — keeps the @prisma/client out of the
  // serverless function bundling pipeline so its native bindings load
  // correctly at runtime.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
    // @react-pdf/renderer uses pdfkit under the hood, which lazily
    // requires font .cjs files at render time via computed paths.
    // Next's tracer can't see those requires and drops the files
    // from the serverless bundle, causing runtime "Cannot find
    // module .../standard-fonts/Helvetica.cjs" (and friends) on
    // Vercel. Include the whole pdfkit/fontkit tree so every lazy
    // require resolves. Note the leading slash: the key is the URL
    // path of the API route.
    outputFileTracingIncludes: {
      "/api/reports/generate": [
        "./node_modules/pdfkit/**/*",
        "./node_modules/fontkit/**/*",
      ],
    },
  },

  async headers() {
    // ── Content Security Policy — Report-Only (phase 1) ──────────────
    //
    // Ships as `Content-Security-Policy-Report-Only` first so the
    // browser REPORTS violations but doesn't block them. We'll watch
    // /api/csp-report for a day or two, tighten anything that fires,
    // then a follow-up branch flips this to the enforcing header
    // name.
    //
    // Origin map (why each entry is here):
    //   self, data:, blob:        app assets + inline-generated images
    //   clerk.swiftreach.app      Clerk's JS bundle, UI, auth iframes
    //   *.clerk.accounts.dev      Clerk's JWT exchange + cookie bridge
    //   challenges.cloudflare.com Clerk's bot-protection (Turnstile)
    //   apis.google.com           Google Picker loader (Drive import)
    //   accounts.google.com       Google OAuth consent iframe + GIS
    //   *.googleapis.com          Sheets + Drive REST (browser-side)
    //   connect.facebook.net      Meta JS SDK (components/MetaSDK.tsx)
    //   *.facebook.com            Meta Embedded Signup iframe
    //
    // 'unsafe-inline' + 'unsafe-eval' on script-src kept for phase 1:
    //   - Next.js emits inline RSC payload scripts (__next_f.push) with
    //     no nonce in the default pipeline
    //   - Clerk's JS uses dynamic evaluation internally
    //   Phase 2 introduces per-request nonces via middleware so we can
    //   drop 'unsafe-inline' for scripts. 'unsafe-inline' on style-src
    //   stays — Next inlines Tailwind styles and the browsers don't
    //   accept nonces for most inline styles anyway.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'", // mirrors X-Frame-Options: DENY, modern form
      "form-action 'self' https://*.facebook.com https://accounts.google.com",
      // Scripts — see loose-ness note above
      [
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "https://clerk.swiftreach.app",
        "https://challenges.cloudflare.com",
        "https://apis.google.com",
        "https://accounts.google.com",
        "https://connect.facebook.net",
      ].join(" "),
      [
        "script-src-elem 'self' 'unsafe-inline'",
        "https://clerk.swiftreach.app",
        "https://challenges.cloudflare.com",
        "https://apis.google.com",
        "https://accounts.google.com",
        "https://connect.facebook.net",
      ].join(" "),
      // Styles — Next + Clerk inline CSS; data: for Clerk UI SVGs
      "style-src 'self' 'unsafe-inline' https://clerk.swiftreach.app",
      "style-src-elem 'self' 'unsafe-inline' https://clerk.swiftreach.app",
      // Images — permissive on purpose. Next/Image, user-uploaded
      // logos, Clerk avatars, OG previews etc. come from many hosts.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://clerk.swiftreach.app",
      // XHR / fetch / WebSocket destinations
      [
        "connect-src 'self'",
        "https://clerk.swiftreach.app",
        "https://*.clerk.accounts.dev",
        "wss://clerk.swiftreach.app",
        "https://sheets.googleapis.com",
        "https://www.googleapis.com",
        "https://graph.facebook.com",
      ].join(" "),
      // Frames the app embeds (Clerk UI, Meta Embedded Signup,
      // Google OAuth, Turnstile)
      [
        "frame-src 'self'",
        "https://clerk.swiftreach.app",
        "https://challenges.cloudflare.com",
        "https://*.facebook.com",
        "https://web.facebook.com",
        "https://accounts.google.com",
      ].join(" "),
      // Workers for Clerk UI + Next
      "worker-src 'self' blob:",
      // Reporting
      "report-uri /api/csp-report",
      // Nudge mixed-content requests to HTTPS before they get blocked
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Report-only — this header NEVER blocks a request, it just
          // posts a report to /api/csp-report. Safe to ship. Phase 2
          // (separate branch) renames to `Content-Security-Policy`
          // to enforce, once the violation log is quiet.
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },

  // Canonicalise the hostname. Both swiftreach.app (apex) and
  // www.swiftreach.app currently resolve to the app; without a
  // redirect Google treats them as separate sites and splits SEO
  // signals, and ad campaigns pointing at one don't benefit the
  // other. Apex is the canonical form (used in the footer + every
  // Metadata API URL below) — 308-redirect www to apex, preserving
  // path + query via :path*.
  //
  // Vercel's dashboard also has a Domains redirect option for the
  // same purpose; this config is the backstop so the redirect lives
  // in version control.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.swiftreach.app" }],
        destination: "https://swiftreach.app/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
