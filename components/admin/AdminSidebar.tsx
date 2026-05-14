"use client";

// Admin sidebar — slate-900 background, indigo-600 accent. Visually distinct
// from the user app's WhatsApp-green sidebar so admins can never confuse the
// two surfaces (and accidentally suspend their own account, etc.).

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Send,
  Activity,
  Megaphone,
  ArrowLeft,
  ShieldCheck,
  LifeBuoy,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/campaigns", label: "Campaigns", icon: Send },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/system", label: "System", icon: Activity },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-slate-900 text-slate-100 min-h-screen p-4">
      <div className="flex items-center gap-2 px-2 py-4 mb-4">
        <div className="bg-indigo-600 rounded-lg p-2">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold leading-tight">SwiftReach</div>
          <div className="text-xs text-indigo-400">Admin</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          // /admin matches exact only; deeper routes match by prefix.
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to App
        </Link>
        <div className="flex items-center gap-3 px-3 py-2">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-400">Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AdminMobileTopbar() {
  return (
    <div className="md:hidden flex items-center gap-2 bg-slate-900 text-slate-100 p-3">
      <div className="bg-indigo-600 rounded-md p-1.5">
        <ShieldCheck className="w-4 h-4 text-white" />
      </div>
      <span className="font-semibold">SwiftReach Admin</span>
    </div>
  );
}
