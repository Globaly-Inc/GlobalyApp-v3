"use client";

import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UniversalFilterPanel } from "./universal-filter-panel";
import type { FilterFieldDefinition } from "./types";
import type { UniversalFilter } from "@/lib/use-universal-filter";

/** Toolbar entry point for the universal filter: a button badged with the active condition count. */
export function FilterBadge({
  filter,
  fieldDefinitions,
}: Readonly<{ filter: UniversalFilter; fieldDefinitions: FilterFieldDefinition[] }>) {
  return (
    <Popover open={filter.panelOpen} onOpenChange={filter.setPanelOpen}>
      <PopoverTrigger render={<Button variant="outline" className="h-10 gap-1.5" />}>
        <Filter className="h-3.5 w-3.5" />
        Filter
        {filter.activeCount > 0 && (
          <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-xs">
            {filter.activeCount}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <UniversalFilterPanel filter={filter} fieldDefinitions={fieldDefinitions} />
      </PopoverContent>
    </Popover>
  );
}
