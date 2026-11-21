// Next.js generates /sitemap.xml from the default export. Lists
// every publicly-indexable URL so search engines don't have to
// discover them from links alone — and so the canonical hostname
// (apex, no www) is explicit for every entry.
//
// Kept intentionally small: only the pages a crawler should actually
// index. No /sign-in, /dashboard, or API routes — those are already
// disallowed in robots.ts.

import type { MetadataRoute } from "next";

const SITE_URL = "https://swiftreach.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/developers`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/data-deletion`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
