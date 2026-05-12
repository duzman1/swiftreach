// Admin layout — gates the entire /admin/* subtree on the email allowlist.
//
// Two-layer protection: middleware.ts already requires a Clerk session at
// the edge; this layout adds the email-allowlist check via requireAdmin()
// (which also runs at the top of every /api/admin/* route — defense in
// depth, never trust the layout alone).
//
// Non-admins land here with a 403 page rather than seeing any admin chrome.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/adminAuth";
import { AdminSidebar, AdminMobileTopbar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin");

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  if (!isAdminEmail(email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Admin access required
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Your account ({email ?? "unknown"}) is not on the admin allowlist.
            If you believe this is a mistake, contact the site owner.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 transition-colors"
          >
            ← Back to App
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-slate-50">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <AdminMobileTopbar />
        <header className="hidden md:flex items-center justify-between bg-slate-800 text-slate-100 px-6 py-3 border-b border-slate-700">
          <div className="text-sm font-medium">SwiftReach Admin</div>
          <div className="text-xs text-slate-400">{email}</div>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
