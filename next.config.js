/** @type {import('next').NextConfig} */

// App brand metadata. Next.js doesn't read HTML <title> / <meta> tags from
// next.config.js itself — those are produced by the Metadata API in
// app/layout.tsx. This block exists so the brand info has a single,
// build-visible source: it's exposed to runtime via env vars below.
const APP_METADATA = {
  title: "SwiftReach",
  description:
    "Send personalized WhatsApp messages at scale. Upload contacts, build templates, track delivery.",
};

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_NAME: APP_METADATA.title,
    NEXT_PUBLIC_APP_DESCRIPTION: APP_METADATA.description,
  },

  // Required for Prisma on Vercel — keeps the @prisma/client out of the
  // serverless function bundling pipeline so its native bindings load
  // correctly at runtime.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
