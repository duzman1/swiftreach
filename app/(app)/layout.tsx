// (app) route group — wraps every signed-in user route with the green
// sidebar + mobile topbar + footer. Sibling to app/admin/layout.tsx and
// to app/page.tsx.
//
// Why a route group instead of conditional chrome in the root layout:
// in App Router, navigating between two routes that share a layout does
// NOT remount that layout. Previous implementations decided chrome inside
// the root layout (either server-side via x-pathname headers, or in a
// client component watching usePathname). Both got stuck across the
// /admin ↔ user-routes boundary because the deciding layout never
// unmounted. Putting admin and user routes in sibling subtrees with
// disjoint layouts means navigating between them ALWAYS unmounts the
// previous layout and mounts the new one — no stuck-chrome bug possible.
//
// `app/page.tsx` stays at the root because route groups can't share a
// URL with the parent's page. The dashboard wraps its own AppShell
// inline (see app/page.tsx).

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shared/AppShell";

export const dynamic = "force-dynamic";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  return <AppShell>{children}</AppShell>;
}
