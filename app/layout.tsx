import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shared/AppShell";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth decides whether the user can have chrome at all.
  // The chrome-vs-admin decision itself runs client-side in <AppShell>
  // (it uses usePathname()) — root layout is preserved across client-side
  // navigations in App Router, so a server-side branch on the pathname
  // gets stuck. See AppShell for the full rationale.
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en">
        <body className="bg-zinc-50 text-foreground antialiased">
          <AppShell isSignedIn={isSignedIn}>{children}</AppShell>
          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
