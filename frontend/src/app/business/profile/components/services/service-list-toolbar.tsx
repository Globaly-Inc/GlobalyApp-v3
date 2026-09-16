"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterBadge } from "@/components/filters/filter-badge";
import type { FilterFieldDefinition } from "@/components/filters/types";
import type { UniversalFilter } from "@/lib/use-universal-filter";
import type { ColumnDefinition } from "@/lib/use-column-preferences";
import { ServiceColumnPicker } from "./service-column-picker";

/** V1's filter bar above the service table: filter, clear, search, column picker. */
export function ServiceListToolbar({
  filter,
  fieldDefinitions,
  search,
  onSearchChange,
  hasActiveFilters,
  onClear,
  columns,
  searchPlaceholder,
  showFilter = true,
}: Readonly<{
  filter: UniversalFilter;
  fieldDefinitions: FilterFieldDefinition[];
  search: string;
  onSearchChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
  columns: {
    allColumns: ColumnDefinition[];
    visibleColumns: string[];
    frozenColumns: string[];
    onToggleColumn: (key: string) => void;
    onToggleFreeze: (key: string) => void;
    onReset: () => void;
  };
  searchPlaceholder: string;
  /** Institutions list read-only extracted courses — the condition builder has nothing to bite on. */
  showFilter?: boolean;
}>) {
  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {showFilter && <FilterBadge filter={filter} fieldDefinitions={fieldDefinitions} />}
          {hasActiveFilters && (
            <Button variant="ghost" className="h-10 text-xs text-muted-foreground" onClick={onClear}>
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
          <div className="flex-1" />
          <div className="relative w-64">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-8 text-sm"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <ServiceColumnPicker {...columns} />
        </div>
      </CardContent>
    </Card>
  );
}
