"use client";

import { FilterBar, SearchInput } from "@/components/ui/filter-bar";

export function InvitesSearch({ value, onChange, total }: Readonly<{ value: string; onChange: (value: string) => void; total: number }>) {
  return (
    <FilterBar>
      <SearchInput
        aria-label="Search invites"
        placeholder="Search by name or email…"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="shrink-0 px-2 text-sm text-muted-foreground">
        {total} invite{total === 1 ? "" : "s"}
      </span>
    </FilterBar>
  );
}
