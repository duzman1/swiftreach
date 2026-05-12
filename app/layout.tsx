import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata = {
  title: "SwiftReach",
  description: "Send personalized WhatsApp messages at scale.",
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
