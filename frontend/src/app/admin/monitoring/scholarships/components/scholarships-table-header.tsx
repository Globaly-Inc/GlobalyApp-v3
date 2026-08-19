"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ROW_GRID } from "./scholarship-row";

export function ScholarshipsTableHeader({
  allSelected,
  someSelected,
  onSelectAll,
}: Readonly<{ allSelected: boolean; someSelected: boolean; onSelectAll: (checked: boolean) => void }>) {
  return (
    <div
      className={`sticky top-16 z-10 grid ${ROW_GRID} items-center gap-3 rounded-t-xl border-b border-primary/15 bg-primary/15 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-primary backdrop-blur-sm supports-backdrop-filter:bg-primary/12`}
    >
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected && !allSelected}
        onCheckedChange={(v) => onSelectAll(!!v)}
        aria-label="Select all"
      />
      <span>Scholarship</span>
      <span>Country</span>
      <span>Basis</span>
      <span>Coverage</span>
      <span>Deadline</span>
      <span>Published</span>
      <span>Featured</span>
      <span className="text-right">Actions</span>
    </div>
  );
}
