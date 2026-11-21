// Branded 404. Replaces Next.js's default "This page could not be found"
// black-and-white screen. Rendered on every unmatched route across the
// whole app (signed-in and signed-out), which means we can't assume
// the signed-in chrome is present — this file ships its own minimal
// header + footer so a logged-out visitor landing on a dead link
// doesn't see an isolated card floating on an empty page.
//
// Default rendering is static — Next picks this up at build time and
// serves it from the edge cache.

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Home, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  // Short + specific — the default "404 · SwiftReach" would be fine
  // but this reads better in a browser tab when the user has multiple
  // broken links open at once.
  title: "Page not found",
  // noindex so Google doesn't try to list the 404 itself (it would
  // otherwise, now that robots.txt doesn't blanket-ban any root path).
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center" aria-label="SwiftReach home">
          <Image
            src="/logo.png"
            alt="SwiftReach"
            width={140}
            height={40}
            className="object-contain"
            priority
          />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-2xl mx-auto w-full text-center py-12">
        <div className="text-7xl font-bold tracking-tight text-zinc-300 mb-3 select-none">
          404
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          We couldn&apos;t find that page.
        </h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          The link may be broken, or the page may have moved. From here you
          can go back to the home page or get in touch.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/">
            <Button size="lg" className="w-full sm:w-auto bg-whatsapp hover:bg-whatsapp-dark text-white gap-2">
              <Home className="w-4 h-4" />
              Back to home
            </Button>
          </Link>
          <Link href="/support">
            <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2">
              <LifeBuoy className="w-4 h-4" />
              Contact support
            </Button>
          </Link>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-4 text-xs text-muted-foreground border-t bg-background">
        <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>SwiftReach · swiftreach.app</div>
          <nav className="flex items-center gap-3">
            <Link className="hover:text-foreground transition-colors" href="/privacy">Privacy Policy</Link>
            <span className="text-zinc-300">·</span>
            <Link className="hover:text-foreground transition-colors" href="/terms">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
