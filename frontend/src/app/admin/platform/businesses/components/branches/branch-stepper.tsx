"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** One continuous track behind the dots; its fill grows as steps advance. Completed steps are
 * clickable when `onStepClick` is given. */
export function BranchStepper({
  steps,
  current,
  subLabels,
  onStepClick,
}: Readonly<{
  steps: readonly string[];
  current: number;
  subLabels?: readonly string[];
  onStepClick?: (step: number) => void;
}>) {
  const inset = `${50 / steps.length}%`;
  return (
    <div className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      <div aria-hidden className="absolute top-3.5 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-border" style={{ left: inset, right: inset }}>
        <div
          className="h-full origin-left bg-primary transition-transform duration-500 ease-[cubic-bezier(.65,0,.35,1)]"
          style={{ transform: `scaleX(${steps.length > 1 ? current / (steps.length - 1) : 0})` }}
        />
      </div>
      {steps.map((label, i) => {
        const done = i < current;
        const clickable = done && !!onStepClick;
        return (
          <button
            key={label}
            type="button"
            disabled={!clickable}
            onClick={() => onStepClick?.(i)}
            aria-current={i === current ? "step" : undefined}
            className="relative flex flex-col items-center gap-1.5 rounded-md disabled:cursor-default"
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-[background-color,box-shadow,transform] duration-300",
                i <= current ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground",
                i === current && "scale-105 ring-4 ring-primary/15",
              )}
            >
              {done ? <Check className="animate-pop-in h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("text-xs font-medium whitespace-nowrap", i <= current ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {subLabels?.[i] && <span className="-mt-1 text-[11px] text-muted-foreground max-sm:hidden">{subLabels[i]}</span>}
          </button>
        );
      })}
    </div>
  );
}
