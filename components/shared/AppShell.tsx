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

import { Navbar, MobileTopbar } from "./Navbar";
import { AnnouncementBanner } from "./AnnouncementBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Navbar />
      <div className="flex flex-col flex-1 min-w-0">
        <MobileTopbar />
        <main className="flex-1 p-6 md:p-10">
          <AnnouncementBanner />
          {children}
        </main>
        <footer className="px-6 md:px-10 py-4 text-xs text-muted-foreground border-t bg-background">
          SwiftReach · swiftreach.app
        </footer>
      </div>
    </div>
  );
}
