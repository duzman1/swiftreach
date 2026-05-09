import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Navbar, MobileTopbar } from "@/components/shared/Navbar";

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
  // Server-side auth check decides which chrome wraps the page.
  // Logged-in users get the sidebar + footer; logged-out users get the bare
  // page so the landing / sign-in / sign-up routes can be full-bleed.
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en">
        <body className="bg-zinc-50 text-foreground antialiased">
          {isSignedIn ? (
            <div className="flex min-h-screen flex-col md:flex-row">
              <Navbar />
              <div className="flex flex-col flex-1 min-w-0">
                <MobileTopbar />
                <main className="flex-1 p-6 md:p-10">{children}</main>
                <footer className="px-6 md:px-10 py-4 text-xs text-muted-foreground border-t bg-background">
                  SwiftReach · swiftreach.app
                </footer>
              </div>
            </div>
          ) : (
            children
          )}

          <Toaster position="top-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
