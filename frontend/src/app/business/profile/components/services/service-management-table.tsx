"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ColumnDefinition } from "@/lib/use-column-preferences";
import { cn } from "@/lib/utils";
import type { BusinessService } from "../../apis/types";
import { ServiceTableCell, type ServiceRowActions } from "./service-table-cell";

export type SortDirection = "asc" | "desc" | null;
export type SortState = { column: string | null; direction: SortDirection };

/** Width rules the frozen block and its scrolling twin have to agree on, or the two misalign. */
const COLUMN_SIZING: Record<string, string> = {
  name: "min-w-[280px] max-w-[360px]",
  actions: "min-w-[120px]",
};

function SortIcon({ column, sort }: Readonly<{ column: string; sort: SortState }>) {
  if (sort.column !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
  return sort.direction === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
}

/**
 * V1's service table: a sticky left-hand block (row checkbox + the pinned columns) that survives
 * horizontal scrolling, with the remaining columns scrolling past it. The block is one `<th>`/
 * `<td>` holding a flex row rather than several sticky cells, because per-cell `left` offsets
 * would need every pinned column's measured width to stay aligned.
 */
export function ServiceManagementTable({
  services,
  allColumns,
  orderedVisibleColumns,
  frozenColumns,
  sort,
  onSortChange,
  selectedIds,
  onSelectedIdsChange,
  onRowClick,
  actions,
}: Readonly<{
  services: BusinessService[];
  allColumns: ColumnDefinition[];
  orderedVisibleColumns: string[];
  frozenColumns: string[];
  sort: SortState;
  onSortChange: (column: string) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (next: Set<string>) => void;
  onRowClick: (service: BusinessService) => void;
  /** Omit to render the table read-only — no checkboxes, no Actions column. */
  actions?: ServiceRowActions;
}>) {
  const selectable = !!actions;
  const frozen = orderedVisibleColumns.filter((key) => frozenColumns.includes(key));
  const scrolling = orderedVisibleColumns.filter((key) => !frozenColumns.includes(key));
  const definition = (key: string) => allColumns.find((c) => c.key === key);

  const allSelected = services.length > 0 && services.every((s) => selectedIds.has(s.id));
  const toggleAll = () => onSelectedIdsChange(allSelected ? new Set() : new Set(services.map((s) => s.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const headerLabel = (key: string) => {
    const col = definition(key);
    if (!col) return null;
    return (
      <span className="flex items-center">
        {col.label}
        {col.sortable && <SortIcon column={key} sort={sort} />}
      </span>
    );
  };

  return (
    <div className="relative w-full overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="sticky left-0 z-20 bg-muted/50 p-0 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              <div className="flex items-center py-3">
                {selectable && (
                  <div className="w-10 shrink-0 px-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all services" />
                  </div>
                )}
                {frozen.map((key) => {
                  const col = definition(key);
                  if (!col) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!col.sortable}
                      onClick={() => col.sortable && onSortChange(key)}
                      className={cn(
                        "px-4 text-left text-xs font-medium whitespace-nowrap",
                        col.sortable && "cursor-pointer select-none hover:text-foreground",
                        key === "actions" && "border-l border-border",
                        COLUMN_SIZING[key],
                      )}
                    >
                      {headerLabel(key)}
                    </button>
                  );
                })}
              </div>
            </th>
            {scrolling.map((key) => {
              const col = definition(key);
              if (!col) return null;
              return (
                <th key={key} className="p-0 text-left">
                  <button
                    type="button"
                    disabled={!col.sortable}
                    onClick={() => col.sortable && onSortChange(key)}
                    className={cn(
                      "w-full px-3 py-3 text-left text-xs font-medium whitespace-nowrap",
                      col.sortable && "cursor-pointer select-none hover:text-foreground",
                    )}
                  >
                    {headerLabel(key)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {services.map((service) => {
            const isSelected = selectedIds.has(service.id);
            return (
              <tr
                key={service.id}
                className={cn("border-b last:border-0 hover:bg-muted/20", selectable && "cursor-pointer", isSelected && "bg-primary/5")}
                onClick={() => onRowClick(service)}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 p-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                    isSelected ? "bg-primary/5" : "bg-background",
                  )}
                >
                  <div className="flex items-center py-2">
                    {selectable && (
                      <div className="w-10 shrink-0 px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(service.id)}
                          aria-label={`Select ${service.name}`}
                        />
                      </div>
                    )}
                    {frozen.map((key) => (
                      <div key={key} className={cn("px-4", key === "actions" && "border-l border-border", COLUMN_SIZING[key])}>
                        <ServiceTableCell service={service} column={key} actions={actions} />
                      </div>
                    ))}
                  </div>
                </td>
                {scrolling.map((key) => (
                  <td key={key} className="px-3 py-2">
                    <ServiceTableCell service={service} column={key} actions={actions} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
