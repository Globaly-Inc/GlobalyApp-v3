"use client";

import { ListFilter, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  MODE_HEADINGS,
  SORT_OPTIONS,
  SOURCE_FILTER_OPTIONS,
  STATUS_CONFIG,
  type DashboardMode,
  type SortOrder,
} from "../const";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...[...new Set(Object.values(STATUS_CONFIG).map((c) => c.label))].map((label) => ({ value: label, label })),
];

type Props = Readonly<{
  mode: DashboardMode;
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
  businessCategoryOptions: { value: string; label: string }[];
  showSelectAll: boolean;
  allPageSelected: boolean;
  onToggleSelectAll: () => void;
  showDeclinedToggle: boolean;
  showDeclined: boolean;
  onToggleShowDeclined: () => void;
  showNewExtractionButton: boolean;
  onNewExtraction: () => void;
}>;

/** The filter/search/action bar above the job list — split out to keep jobs-list.tsx under the line cap. */
export function JobsListToolbar({
  mode,
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
  showSelectAll,
  allPageSelected,
  onToggleSelectAll,
  showDeclinedToggle,
  showDeclined,
  onToggleShowDeclined,
  showNewExtractionButton,
  onNewExtraction,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ListFilter className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{MODE_HEADINGS[mode].title}</p>
          <p className="text-sm text-muted-foreground">
            {jobCount} job{jobCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or URL…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-56 pl-7 text-xs"
          />
        </div>

        <Combobox
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={onStatusFilterChange}
          className="h-8 w-40 text-xs cursor-pointer"
        />

        <Combobox
          options={businessCategoryOptions}
          value={businessCategoryFilter}
          onChange={onBusinessCategoryFilterChange}
          className="h-8 w-40 text-xs cursor-pointer"
        />

        <Combobox
          options={SORT_OPTIONS}
          value={sortOrder}
          onChange={(v) => onSortOrderChange(v as SortOrder)}
          className="h-8 w-40 text-xs cursor-pointer"
        />

        {showSelectAll && (
          <Button variant="ghost" className="h-8 gap-1.5 text-xs cursor-pointer" onClick={onToggleSelectAll}>
            {/* ponytail: rendered as a span — a real checkbox button inside a button is invalid HTML */}
            <Checkbox checked={allPageSelected} render={<span />} className="pointer-events-none" />
            {allPageSelected ? "Deselect page" : "Select page"}
          </Button>
        )}

        {showSourceFilter && (
          <Combobox
            options={SOURCE_FILTER_OPTIONS}
            value={sourceFilter}
            onChange={onSourceFilterChange}
            className="h-8 w-36 text-xs cursor-pointer"
          />
        )}

        {showDeclinedToggle && (
          <Button
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground cursor-pointer"
            onClick={onToggleShowDeclined}
          >
            {showDeclined ? "Hide" : "Show"} declined
          </Button>
        )}

        {showNewExtractionButton && (
          <Button className="gap-2 px-4 cursor-pointer" onClick={onNewExtraction}>
            <Plus className="h-4 w-4" />
            New Extraction
          </Button>
        )}
      </div>
    </div>
  );
}
