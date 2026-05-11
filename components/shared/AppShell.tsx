"use client";

// Client-side chrome decision. Lives outside the root layout so it re-runs
// on every client navigation via usePathname() — root layout itself is
// preserved across same-tree route changes in App Router, which means a
// server-side branch on `headers().get("x-pathname")` gets stuck after the
// first render. Symptom: navigating /admin → / would leave the user
// sidebar hidden because the cached root layout still thought we were on
// /admin.
//
// On admin routes: render children only (the admin layout provides its
// own slate-900 sidebar).
// On user routes: render the full user chrome (Navbar + announcement
// banner + footer).
// On signed-out routes: render children only (landing / sign-in / sign-up
// can be full-bleed).

import { usePathname } from "next/navigation";
import { Navbar, MobileTopbar } from "./Navbar";
import { AnnouncementBanner } from "./AnnouncementBanner";

interface Props {
  isSignedIn: boolean;
  children: React.ReactNode;
}

export function AppShell({ isSignedIn, children }: Props) {
  const pathname = usePathname() ?? "";
  const isAdminRoute = pathname.startsWith("/admin");

  if (!isSignedIn || isAdminRoute) {
    return <>{children}</>;
  }

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
