// Minimal root layout. Wraps html/body and provides ClerkProvider +
// Toaster to everything. Does NOT render any chrome — chrome belongs to
// the route group:
//   - app/(app)/layout.tsx       → user chrome (sidebar)
//   - app/admin/layout.tsx       → admin chrome (slate sidebar)
//   - app/page.tsx               → wraps its own AppShell inline (signed-in)
//                                  or renders bare LandingPage (signed-out)
//   - app/sign-in, app/sign-up   → bare auth pages
//
// Putting chrome in a child layout instead of here means navigating between
// admin and user routes guarantees one layout unmounts and another mounts.
// Previously chrome was decided here based on pathname, which got stuck
// across navigations because root layout never unmounts (App Router
// preserves shared layouts).

import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ClerkProvider } from "@clerk/nextjs";

const APP_TITLE = "SwiftReach — WhatsApp Business marketing for small businesses";
const APP_DESCRIPTION =
  "Create, send, and track compliant WhatsApp Business campaigns for opted-in customers. Upload contacts, build reusable message templates, and monitor delivery in real time.";

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: "%s · SwiftReach",
  },
  description: APP_DESCRIPTION,
  applicationName: "SwiftReach",
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    siteName: "SwiftReach",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en">
        <body className="bg-zinc-50 text-foreground antialiased">
          {children}
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
