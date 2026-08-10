"use client";

// Lightweight pill tab-switcher for pages that had in-page Tabs in V2 (Categories,
// AI Knowledge). No shadcn Tabs primitive exists in this app yet — ponytail: swap for
// one if a page needs keyboard/ARIA tab semantics later.

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function AdminSegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: Readonly<{ options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void }>) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 mb-4 w-fit max-w-full">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer",
            value === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
