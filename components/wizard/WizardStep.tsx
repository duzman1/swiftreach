"use client";

// Common wrapper for every wizard step. Renders the heading, the
// children (body), and a Back/Next footer. Each step page just provides
// content + the right callbacks — back/next button labels, disabled
// state, and the loading spinner are handled here so they stay
// consistent across all 7 steps.

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  stepNumber: number;
  totalSteps?: number;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;

  // Footer controls. Either provide both onBack/onNext or hide them.
  onBack?: () => void;
  onNext?: () => void | Promise<void>;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  hideBack?: boolean;
  hideNext?: boolean;
}

export function WizardStep({
  stepNumber,
  totalSteps = 7,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Next →",
  backLabel = "← Back",
  nextDisabled,
  loading,
  hideBack,
  hideNext,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 shadow-sm">
      <header className="px-6 md:px-8 pt-6 pb-4 border-b border-zinc-100">
        <div className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
          Step {stepNumber} of {totalSteps}
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mt-1">{title}</h2>
        {subtitle && (
          <div className="mt-2 text-sm text-zinc-600 leading-relaxed">{subtitle}</div>
        )}
      </header>

      <div className="px-6 md:px-8 py-6 space-y-5 text-zinc-700 leading-relaxed">
        {children}
      </div>

      {(!hideBack || !hideNext) && (
        <footer className="px-6 md:px-8 py-4 border-t border-zinc-100 flex items-center justify-between gap-3">
          <div>
            {!hideBack && onBack && (
              <Button
                variant="ghost"
                onClick={onBack}
                disabled={loading}
                className="gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                {backLabel}
              </Button>
            )}
          </div>
          <div>
            {!hideNext && onNext && (
              <Button
                onClick={() => void onNext()}
                disabled={nextDisabled || loading}
                className="gap-1.5 bg-whatsapp hover:bg-whatsapp-dark text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {nextLabel}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
