// User-facing chrome: green sidebar + mobile topbar + announcement banner +
// footer. Wraps every signed-in user page.
//
// Used in two places:
//   1. app/(app)/layout.tsx — wraps every page in the (app) route group
//   2. app/page.tsx — the dashboard at `/` lives outside the (app) group
//      (route groups can't share the URL with the root page), so the
//      signed-in branch wraps its own content with this.
//
// This is intentionally NOT a client component and does NO pathname
// branching. The shared-layout caching bug that bit the previous fix
// happened because a single root layout was deciding chrome based on
// pathname; routing now puts admin and user pages in sibling subtrees
// with their own layouts, so admin chrome and user chrome are mutually
// exclusive by file structure.

import Link from "next/link";
import { Navbar, MobileTopbar } from "./Navbar";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { HelpButton } from "./HelpButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Navbar />
      <div className="flex flex-col flex-1 min-w-0">
        <MobileTopbar />
        <main className="flex-1 p-6 md:p-10">
          <AnnouncementBanner />
          {children}
        </main>
        {/* Floating help launcher. AppShell only wraps user-facing
            pages, so the button is automatically absent on /admin
            (which uses app/admin/layout.tsx instead). */}
        <HelpButton />
        <footer className="px-6 md:px-10 py-4 text-xs text-muted-foreground border-t bg-background">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>SwiftReach · swiftreach.app</div>
            <nav className="flex items-center gap-3">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <span className="text-zinc-300">·</span>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <span className="text-zinc-300">·</span>
              <Link href="/data-deletion" className="hover:text-foreground transition-colors">
                Data Deletion
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
