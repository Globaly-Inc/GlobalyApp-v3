"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_FILTERS, type StatusFilterKey } from "../const";

/**
 * Status pills over the list, in the same shape as the site search's tabs
 * (rounded-full, default/ghost) so filtering looks the same wherever it appears.
 *
 * Empty buckets are dropped rather than shown at zero — a "Converted 0" pill is a
 * dead control. If that leaves nothing but "All" plus one bucket, the whole row is
 * hidden: filtering a list where every row is in the same bucket says nothing.
 */
export function EnquiryFilters({
  counts,
  active,
  onChange,
}: Readonly<{
  counts: Record<StatusFilterKey, number>;
  active: StatusFilterKey;
  onChange: (key: StatusFilterKey) => void;
}>) {
  const visible = STATUS_FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0);
  if (visible.length < 3) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter enquiries by status">
      {visible.map((filter) => {
        const isActive = filter.key === active;
        return (
          <Button
            key={filter.key}
            type="button"
            size="sm"
            variant={isActive ? "default" : "ghost"}
            aria-pressed={isActive}
            onClick={() => onChange(filter.key)}
            className="h-8 gap-1.5 rounded-full px-3 text-sm font-medium"
          >
            {filter.label}
            <span
              className={cn(
                "tabular-nums",
                isActive ? "text-primary-foreground/70" : "text-muted-foreground/70",
              )}
            >
              {counts[filter.key]}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
