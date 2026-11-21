// Next.js generates /robots.txt from the default export. Served
// at the apex and canonical in the sitemap below.
//
// Policy:
// - Allow crawlers on the marketing + legal pages.
// - Disallow the whole signed-in app surface (/dashboard, /settings,
//   /contacts, etc.), Clerk auth pages (no public value to index),
//   and every /api route. Crawling API endpoints just wastes crawl
//   budget and risks accidentally indexing JSON error pages.
// - Point to the sitemap so Google picks up every canonical URL
//   without having to guess.

import type { MetadataRoute } from "next";

const SITE_URL = "https://swiftreach.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/privacy",
          "/terms",
          "/data-deletion",
          "/developers",
        ],
        disallow: [
          "/api/",
          "/sign-in",
          "/sign-up",
          "/dashboard",
          "/inbox",
          "/send",
          "/contacts",
          "/campaigns",
          "/scheduled",
          "/automations",
          "/analytics",
          "/templates",
          "/whatsapp-templates",
          "/support",
          "/billing",
          "/settings",
          "/onboarding",
          "/admin",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
