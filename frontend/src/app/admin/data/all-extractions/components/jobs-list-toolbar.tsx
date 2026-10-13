"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { SORT_OPTIONS, SOURCE_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, type SortOrder } from "../const";

const STATUS_COMBOBOX_OPTIONS = [{ value: "all", label: "All statuses" }, ...STATUS_FILTER_OPTIONS];

type Props = Readonly<{
  jobCount: number;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (v: SortOrder) => void;
  sourceFilter: string;
  onSourceFilterChange: (v: string) => void;
  showSourceFilter: boolean;
  businessCategoryFilter: string;
  onBusinessCategoryFilterChange: (v: string) => void;
  businessCategoryOptions: ComboboxOption[];
  showDeclinedToggle: boolean;
  showDeclined: boolean;
  onToggleShowDeclined: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}>;

/** The search/filter strip above the job table — split out to keep jobs-list.tsx under the line cap. */
export function JobsListToolbar({
  jobCount,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  sourceFilter,
  onSourceFilterChange,
  showSourceFilter,
  businessCategoryFilter,
  onBusinessCategoryFilterChange,
  businessCategoryOptions,
  showDeclinedToggle,
  showDeclined,
  onToggleShowDeclined,
  hasActiveFilters,
  onClearFilters,
}: Props) {
  return (
    <FilterBar>
      <SearchInput placeholder="Search by name or URL…" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} />

      <Combobox options={STATUS_COMBOBOX_OPTIONS} value={statusFilter} onChange={onStatusFilterChange} className="w-40 bg-background" />
      <Combobox
        options={businessCategoryOptions}
        value={businessCategoryFilter}
        onChange={onBusinessCategoryFilterChange}
        className="w-40 bg-background"
      />
      <Combobox
        options={SORT_OPTIONS}
        value={sortOrder}
        onChange={(v) => onSortOrderChange(v as SortOrder)}
        className="w-40 bg-background"
      />
      {showSourceFilter && (
        <Combobox options={SOURCE_FILTER_OPTIONS} value={sourceFilter} onChange={onSourceFilterChange} className="w-36 bg-background" />
      )}

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onClearFilters}>
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      )}
      {showDeclinedToggle && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onToggleShowDeclined}>
          {showDeclined ? "Hide" : "Show"} declined
        </Button>
      )}

      <span className="shrink-0 px-2 text-sm text-muted-foreground">
        {jobCount} job{jobCount === 1 ? "" : "s"}
      </span>
    </FilterBar>
  );
}
