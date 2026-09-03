"use client";

// Lightweight pill tab-switcher for pages that had in-page Tabs in V2 (Categories,
// AI Knowledge). No shadcn Tabs primitive exists in this app yet — ponytail: swap for
// one if a page needs keyboard/ARIA tab semantics later.

import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/scroll-row";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing tally — rendered muted so the label stays the thing you read first. */
  count?: number;
}

export function AdminSegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: Readonly<{ options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; className?: string }>) {
  return (
    <ScrollRow className={cn("mb-4 w-fit max-w-full", className)} rowClassName="flex items-center gap-1 rounded-lg bg-muted p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer",
            value === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
          {opt.count != null && (
            <span className={cn("tabular-nums", value === opt.value ? "text-muted-foreground" : "text-muted-foreground/70")}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </ScrollRow>
  );
}
