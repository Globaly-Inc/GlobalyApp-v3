"use client";

import { cn } from "@/lib/utils";

/** The "1 Categories — 2 Source — 3 Review" progress header atop NewExtractionDialog. */
export function ExtractionStepIndicator({ steps, current }: Readonly<{ steps: string[]; current: number }>) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, index) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
              index <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {index + 1}
          </span>
          <span className={cn("text-xs", index === current ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          {index < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}
