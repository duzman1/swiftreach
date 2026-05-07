import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Navbar, MobileTopbar } from "@/components/shared/Navbar";

const APP_TITLE = "SwiftReach — WhatsApp Bulk Messenger";
const APP_DESCRIPTION =
  "Send personalized WhatsApp messages at scale with SwiftReach. Upload any contact list, build custom message templates, and track delivery in real time.";

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
    <html lang="en">
      <body className="bg-zinc-50 text-foreground antialiased">
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
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
