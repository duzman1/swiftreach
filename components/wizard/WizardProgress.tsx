"use client";

// Progress bar across the top of every wizard step. Numbered dots,
// connecting line, green = done, green-ring = current, gray = future.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentStep: number; // 1-indexed
  totalSteps?: number;
  /** Highest step reached — anything <= this is "done" even when the
   * user navigates back to a lower step. */
  furthestStep?: number;
}

export function WizardProgress({ currentStep, totalSteps = 7, furthestStep }: Props) {
  const reached = Math.max(furthestStep ?? currentStep, currentStep);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step, idx) => {
          const done = step < reached;
          const current = step === currentStep;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-initial">
              <div
                className={cn(
                  "relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors",
                  done && "bg-whatsapp text-white",
                  current && !done && "bg-white text-whatsapp ring-2 ring-whatsapp",
                  !done && !current && "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200"
                )}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${step}${done ? " complete" : current ? " current" : ""}`}
              >
                {done ? <Check className="w-4 h-4" /> : step}
              </div>
              {idx < totalSteps - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 transition-colors",
                    step < reached ? "bg-whatsapp" : "bg-zinc-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center text-xs text-zinc-500 mt-3">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
}
