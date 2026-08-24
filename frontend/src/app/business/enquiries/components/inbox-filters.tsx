"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INBOX_FILTERS, type InboxFilterKey } from "../const";

/**
 * Status pills over the inbox, in the same shape as the student enquiries list and the
 * site search's tabs, so filtering looks the same wherever it appears.
 *
 * These replaced a seven-across grid of stat cards. The counts are the same information,
 * but a pill is a control: seeing "New 3" and being unable to click it was the worst of
 * both.
 *
 * All three always render, including at zero. They are a fixed taxonomy that partitions
 * every status, so "New 0" is a fact worth knowing — unlike an optional filter, where a
 * zero would just be a dead control. Hiding them also made the set look like it was
 * All/In progress/Closed, which is not what it is.
 */
export function InboxFilters({
  counts,
  active,
  onChange,
}: Readonly<{
  counts: Record<InboxFilterKey, number>;
  active: InboxFilterKey;
  onChange: (key: InboxFilterKey) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter enquiries by status">
      {INBOX_FILTERS.map((filter) => {
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
            <span className={cn("tabular-nums", isActive ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
              {counts[filter.key]}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
