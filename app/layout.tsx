import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";

const SITE_URL = "https://swiftreach.app";
const BRAND = "SwiftReach";
const TAGLINE = "WhatsApp Business marketing for small businesses.";
const DESCRIPTION =
  "Create, send, and track compliant WhatsApp Business campaigns to opted-in customers. Personalize every message, build reusable templates, and monitor delivery in real time.";

// metadataBase lets Next resolve relative image paths in the OG/
// Twitter blocks against the production hostname. Without it a share
// of swiftreach.app would try to resolve /opengraph-image against
// localhost on preview builds and come up empty.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: BRAND,
    // Pages that set their own title via metadata get " · SwiftReach"
    // appended automatically. Skip this on the landing page by
    // exporting `title` as a plain string from app/page.tsx.
    template: `%s · ${BRAND}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND,
  keywords: [
    "WhatsApp Business",
    "WhatsApp marketing",
    "WhatsApp campaigns",
    "bulk WhatsApp",
    "WhatsApp API",
    "customer messaging",
  ],
  // Tells Google this is the canonical hostname. Combined with the
  // www→apex redirect in next.config.js, this collapses the
  // duplicate-content risk.
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: BRAND,
    title: `${BRAND} — ${TAGLINE}`,
    description: DESCRIPTION,
    // No explicit `images` entry: Next auto-serves app/opengraph-image.tsx
    // at /opengraph-image when the file exists, and injects it into the
    // og:image + twitter:image tags. Declaring it here as well would
    // double-tag it.
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND} — ${TAGLINE}`,
    description: DESCRIPTION,
    // Same note: the OG image file auto-populates twitter:image.
  },
  // Default robots policy. Individual pages can override via their own
  // metadata export (e.g. the admin route should stay noindex even
  // behind auth, in case something slips through).
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  // Google Search Console domain verification. The token below is rendered
  // by Next as <meta name="google-site-verification" content="..." /> in
  // the <head> of every page. Google's verifier fetches the root and
  // checks for this exact tag.
  verification: {
    google: "CkaPjHZzCp_GK2n14jMFodu7Ame-2TaftLuY4O8t1u4",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
