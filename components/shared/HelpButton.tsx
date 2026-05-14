"use client";

// Floating help button (bottom-right, all user-facing pages). Opens a
// small popup with the four primary "I need help" actions plus a
// direct support email line.
//
// Mounted from AppShell, so it's automatically present on every page
// that uses the user app chrome — and absent on /admin (admin layout
// has its own chrome).

import * as React from "react";
import Link from "next/link";
import { HelpCircle, X, MessageSquare, BookOpen, Wrench, HandHelping, Mail } from "lucide-react";
import { SetupRequestModal } from "@/components/wizard/SetupRequestModal";

export function HelpButton() {
  const [open, setOpen] = React.useState(false);
  const [setupModalOpen, setSetupModalOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  // Close on click-outside or Escape.
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      )
        return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      {/* Popup — slide-up + fade. Anchored above the button. */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Help menu"
          className="fixed bottom-24 right-6 z-50 w-72 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              How can we help?
            </h3>
            <button
              onClick={close}
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              aria-label="Close help menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2 space-y-1 text-sm">
            <Link
              href="/support"
              onClick={close}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-50 text-zinc-700"
            >
              <MessageSquare className="w-4 h-4 text-whatsapp" />
              Contact Support
            </Link>
            <Link
              href="/onboarding?mode=manual"
              onClick={close}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-50 text-zinc-700"
            >
              <BookOpen className="w-4 h-4 text-whatsapp" />
              Setup Guide
            </Link>
            <Link
              href="/onboarding?mode=manual"
              onClick={close}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-50 text-zinc-700"
            >
              <Wrench className="w-4 h-4 text-whatsapp" />
              Set Up Manually
            </Link>
            <button
              type="button"
              onClick={() => {
                close();
                setSetupModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-50 text-zinc-700 text-left"
            >
              <HandHelping className="w-4 h-4 text-whatsapp" />
              Done-For-You Setup — $149
            </button>
          </div>
          <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50">
            <a
              href="mailto:support@swiftreach.app"
              className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-900"
            >
              <Mail className="w-3.5 h-3.5" />
              support@swiftreach.app
            </a>
          </div>
        </div>
      )}

      {/* Button itself. Fixed bottom-right, above the footer. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help" : "Open help"}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#25D366] hover:bg-[#1ea855] text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-colors"
      >
        {open ? <X className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
      </button>

      <SetupRequestModal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
      />
    </>
  );
}
