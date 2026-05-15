"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Send,
  BookOpen,
  Clock,
  History,
  BarChart3,
  FileText,
  Settings,
  CreditCard,
  Lock,
  LifeBuoy,
  Code2,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { PlanBadge } from "./PlanBadge";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** When true, free-plan users see a lock icon next to the label. */
  paidOnly?: boolean;
  /** Live unread badge (only "inbox" today). */
  badge?: "inbox";
};

// Sidebar sections. Each section is rendered with a divider between groups
// per the Phase 6 spec.
const SECTIONS: { items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, paidOnly: true, badge: "inbox" },
      { href: "/send", label: "New Campaign", icon: Send },
    ],
  },
  {
    items: [
      { href: "/contacts", label: "Contacts", icon: BookOpen, paidOnly: true },
      { href: "/scheduled", label: "Scheduled", icon: Clock, paidOnly: true },
      { href: "/campaigns", label: "Campaigns", icon: History },
      { href: "/analytics", label: "Analytics", icon: BarChart3, paidOnly: true },
      { href: "/templates", label: "Templates", icon: FileText },
    ],
  },
  {
    items: [
      { href: "/support", label: "Support", icon: LifeBuoy },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/settings/api-keys", label: "API Keys", icon: Code2, paidOnly: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

interface BillingStatus {
  plan: "free" | "starter" | "growth";
}

function isPaid(plan: BillingStatus["plan"] | null): boolean {
  return plan === "starter" || plan === "growth";
}

function useInboxUnread(enabled: boolean): number {
  const [count, setCount] = React.useState(0);

  const fetchCount = React.useCallback(async () => {
    try {
      const r = await fetch("/api/inbox/unread-count");
      const j = await r.json();
      if (j.ok) setCount(j.count);
    } catch {
      // Silent — badge is best-effort.
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    fetchCount();
    // Poll every 30s. Cheap query — single COUNT against an indexed column.
    const id = setInterval(fetchCount, 30_000);
    // Also refresh when the inbox page emits a read event so the badge
    // updates immediately on mark-as-read.
    const onRead = () => fetchCount();
    window.addEventListener("inbox:read", onRead);
    return () => {
      clearInterval(id);
      window.removeEventListener("inbox:read", onRead);
    };
  }, [enabled, fetchCount]);

  return count;
}

function useBillingStatus(): BillingStatus | null {
  const [status, setStatus] = React.useState<BillingStatus | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok) setStatus({ plan: j.plan });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export function Navbar() {
  const pathname = usePathname();
  const billing = useBillingStatus();
  const paid = isPaid(billing?.plan ?? null);
  const inboxCount = useInboxUnread(paid);

  // Single "active" href computed up front so that, e.g. on /settings/api-keys
  // the broader /settings link doesn't also light up. We pick the longest
  // href whose prefix the current pathname matches.
  const activeHref = React.useMemo(() => {
    const all = SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    let best: { href: string; len: number } | null = null;
    for (const href of all) {
      const match =
        href === "/"
          ? pathname === "/"
          : pathname === href || pathname.startsWith(href + "/");
      if (match && (!best || href.length > best.len)) {
        best = { href, len: href.length };
      }
    }
    return best?.href ?? null;
  }, [pathname]);

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-zinc-900 text-zinc-100 min-h-screen p-4">
      <div className="flex items-center px-2 py-4 mb-4">
        <Image
          src="/logo.png"
          alt="SwiftReach"
          width={140}
          height={40}
          className="object-contain"
          priority
        />
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {SECTIONS.map((section, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <div className="h-px bg-zinc-800 my-2 mx-1" />}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={item.href === activeHref}
                paid={paid}
                inboxCount={inboxCount}
              />
            ))}
          </React.Fragment>
        ))}
      </nav>

      {/* Account avatar + sign-out, pinned to bottom. */}
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

function NavLink({
  item,
  active,
  paid,
  inboxCount,
}: {
  item: NavItem;
  active: boolean;
  paid: boolean;
  inboxCount: number;
}) {
  const Icon = item.icon;
  const locked = item.paidOnly && !paid;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group",
        active
          ? "bg-whatsapp text-white"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
      )}
      title={locked ? `${item.label} — Starter / Growth only` : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge === "inbox" && inboxCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
          {inboxCount > 99 ? "99+" : inboxCount}
        </span>
      )}
      {locked && (
        <Lock
          className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300"
          aria-label="Paid feature"
        />
      )}
    </Link>
  );
}

export function MobileTopbar() {
  return (
    <div className="md:hidden flex items-center bg-zinc-900 text-zinc-100 p-3">
      <Image
        src="/logo.png"
        alt="SwiftReach"
        width={120}
        height={34}
        className="object-contain"
      />
    </div>
  );
}
