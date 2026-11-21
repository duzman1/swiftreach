// Dynamically-generated Open Graph image, served at /opengraph-image.
// Next.js auto-wires this into every page's <meta property="og:image">
// and <meta name="twitter:image">, so every link shared on WhatsApp /
// Twitter / Slack / LinkedIn gets a branded 1200×630 card.
//
// No PNG asset required: ImageResponse (via @vercel/og, bundled in
// next/og) renders the JSX below to PNG at the edge on each request,
// and Vercel caches the result for us.
//
// Only the public tagline + brand are used — nothing user-specific —
// so caching the generated image is safe. If the tagline changes,
// bump a cache-buster query by re-exporting with a new `alt` or by
// changing the file's mtime at build.

import { ImageResponse } from "next/og";

export const runtime = "edge";
// Used for the <meta name="og:image:alt"> text; also surfaces as the
// screen-reader label on sites that render it visibly.
export const alt = "SwiftReach — WhatsApp Business marketing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  // WhatsApp green ramp — matches the brand colour used throughout
  // the app (bg-whatsapp = #25D366).
  const BG = "#0F1A14";
  const ACCENT = "#25D366";
  const TEXT = "#FFFFFF";
  const MUTED = "#A7B3AD";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(135deg, ${BG} 0%, #11241A 100%)`,
          padding: "72px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: BG,
              fontSize: "32px",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            S
          </div>
          <div style={{ fontSize: "36px", color: TEXT, fontWeight: 700, letterSpacing: "-0.02em" }}>
            SwiftReach
          </div>
        </div>

        {/* Main pitch */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "980px" }}>
          <div
            style={{
              fontSize: "76px",
              lineHeight: 1.05,
              color: TEXT,
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            WhatsApp Business marketing for small businesses.
          </div>
          <div style={{ fontSize: "30px", color: MUTED, lineHeight: 1.3 }}>
            Personalized campaigns to opted-in customers. Real-time delivery tracking.
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid rgba(167, 179, 173, 0.25)`,
            paddingTop: "28px",
          }}
        >
          <div style={{ fontSize: "24px", color: MUTED }}>swiftreach.app</div>
          <div
            style={{
              fontSize: "22px",
              color: BG,
              background: ACCENT,
              padding: "12px 24px",
              borderRadius: "999px",
              fontWeight: 600,
            }}
          >
            Get started free →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
