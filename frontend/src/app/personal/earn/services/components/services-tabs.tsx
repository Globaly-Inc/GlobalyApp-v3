"use client";

// Local pill tab-switcher. No shadcn Tabs primitive exists in this app, and the admin portal's equivalent
// stays where it is — this feature keeps its own copy rather than moving a shared component and touching
// unrelated views.
//
// ponytail: buttons, not ARIA tab semantics. Swap for a real tablist if keyboard tab navigation is ever asked
// for; the three panels here are plain content, not a widget.

import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/scroll-row";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

export function ServicesTabs<T extends string>({
  options,
  value,
  onChange,
}: Readonly<{ options: readonly TabOption<T>[]; value: T; onChange: (value: T) => void }>) {
  return (
    <ScrollRow className="w-full sm:w-fit sm:max-w-full" rowClassName="flex items-center gap-1 rounded-lg bg-muted p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 sm:flex-none whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            value === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
          <span className={cn("ml-1.5 text-xs", value === opt.value ? "text-muted-foreground" : "opacity-70")}>
            {opt.count}
          </span>
        </button>
      ))}
    </ScrollRow>
  );
}
