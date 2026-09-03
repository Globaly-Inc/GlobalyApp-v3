"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { OWNERSHIP_FILTER_OPTIONS, SORT_OPTIONS, SOURCE_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "../../const";

export function BusinessFiltersBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  categoryOptions,
  sourceFilter,
  onSourceChange,
  ownershipFilter,
  onOwnershipChange,
  sort,
  onSortChange,
}: Readonly<{
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: ComboboxOption[];
  sourceFilter: string;
  onSourceChange: (value: string) => void;
  ownershipFilter: string;
  onOwnershipChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
}>) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search businesses..."
          className="h-10 pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Combobox options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={onStatusChange} className="h-10 w-44 cursor-pointer" />
      <Combobox options={categoryOptions} value={categoryFilter} onChange={onCategoryChange} className="h-10 w-44 cursor-pointer" />
      <Combobox options={SOURCE_FILTER_OPTIONS} value={sourceFilter} onChange={onSourceChange} className="h-10 w-44 cursor-pointer" />
      <Combobox options={OWNERSHIP_FILTER_OPTIONS} value={ownershipFilter} onChange={onOwnershipChange} className="h-10 w-44 cursor-pointer" />
      <Combobox options={SORT_OPTIONS} value={sort} onChange={onSortChange} className="h-10 w-44 cursor-pointer" />
    </div>
  );
}
