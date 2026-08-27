"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INBOX_FILTERS, type InboxFilterKey } from "../const";
import type { AdminEnquiryStats } from "../apis";

export type FilterKey = InboxFilterKey | "all";

/**
 * New / Unlocked / Closed — the same three buckets the business inbox uses, plus All.
 * Eight raw statuses would be eight pills, most of them dead on a young platform; the
 * three buckets partition every status, so nothing is unreachable.
 *
 * The v1 admin screen showed these counts as a grid of stat cards. The counts are the
 * same information, but a pill is a control: seeing "Unlocked 3" and being unable to
 * click it was the worst of both.
 *
 * All four always render, including at zero — a fixed taxonomy, so "New 0" is a fact.
 */
export function EnquiryStatusFilter({
  stats,
  active,
  onChange,
}: Readonly<{ stats: AdminEnquiryStats | null; active: FilterKey; onChange: (key: FilterKey) => void }>) {
  const counts = new Map((stats?.statuses ?? []).map((s) => [s.status, Number(s.count)]));
  const countOf = (statuses: readonly string[]) =>
    statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter enquiries by status">
      <Pill label="All" count={stats?.total ?? 0} active={active === "all"} onClick={() => onChange("all")} />
      {INBOX_FILTERS.map((filter) => (
        <Pill
          key={filter.key}
          label={filter.label}
          count={countOf(filter.statuses)}
          active={active === filter.key}
          onClick={() => onChange(filter.key)}
        />
      ))}
    </div>
  );
}

function Pill({
  label,
  count,
  active,
  onClick,
}: Readonly<{ label: string; count: number; active: boolean; onClick: () => void }>) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "ghost"}
      aria-pressed={active}
      onClick={onClick}
      className="h-8 gap-1.5 rounded-full px-3 text-sm font-medium"
    >
      {label}
      <span className={cn("tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
        {count}
      </span>
    </Button>
  );
}
