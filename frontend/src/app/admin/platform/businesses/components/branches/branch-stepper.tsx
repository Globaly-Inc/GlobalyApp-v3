"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function BranchStepper({ steps, current }: Readonly<{ steps: readonly string[]; current: number }>) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => (
        <div key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i <= current ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
              )}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs font-medium whitespace-nowrap", i <= current ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <div className={cn("mx-2 h-px flex-1 self-start mt-3.5", i < current ? "bg-primary" : "bg-border")} />}
        </div>
      ))}
    </div>
  );
}
