"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Send, History, FileText, Settings, MessageCircle, CreditCard } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { PlanBadge } from "./PlanBadge";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/send", label: "New Campaign", icon: Send },
  { href: "/campaigns", label: "Campaigns", icon: History },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-zinc-900 text-zinc-100 min-h-screen p-4">
      <div className="flex items-center gap-2 px-2 py-4 mb-4">
        <div className="bg-whatsapp rounded-lg p-2">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold leading-tight">SwiftReach</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-whatsapp text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Account avatar + sign-out, pinned to bottom of sidebar.
          Clerk's UserButton pops a menu with profile + sign-out. */}
      <div className="mt-auto pt-4 border-t border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-400">Account</div>
          </div>
          <PlanBadge />
        </div>
      </div>
    </aside>
  );
}

export function MobileTopbar() {
  return (
    <div className="md:hidden flex items-center gap-2 bg-zinc-900 text-zinc-100 p-3">
      <div className="bg-whatsapp rounded-md p-1.5">
        <MessageCircle className="w-4 h-4 text-white" />
      </div>
      <span className="font-semibold">SwiftReach</span>
    </div>
  );
}
