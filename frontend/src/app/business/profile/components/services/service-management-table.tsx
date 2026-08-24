"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, Package, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PriceEditPopover } from "@/app/admin/platform/businesses/components/services/price-edit-popover";
import type { BusinessService } from "../../apis/types";

export type SortColumn = "name" | "category" | "degree_level" | "area_of_study" | "duration" | "price" | "status";
export type SortState = { column: SortColumn | null; direction: "asc" | "desc" };

export type ColumnKey = "category" | "degree_level" | "area_of_study" | "duration" | "location" | "price" | "status";

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  category: "Category", degree_level: "Degree Level", area_of_study: "Subject Area",
  duration: "Duration", location: "Location", price: "Price", status: "Status",
};

const SORTABLE: Partial<Record<ColumnKey, SortColumn>> = {
  category: "category", degree_level: "degree_level", area_of_study: "area_of_study",
  duration: "duration", price: "price", status: "status",
};

export function ServiceManagementTable({
  services,
  visibleColumns,
  sort,
  onSortChange,
  selectedIds,
  onSelectedIdsChange,
  onEdit,
  onTogglePublish,
  onPriceSave,
  onDelete,
}: Readonly<{
  services: BusinessService[];
  visibleColumns: Set<ColumnKey>;
  sort: SortState;
  onSortChange: (column: SortColumn) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (next: Set<string>) => void;
  onEdit: (id: string) => void;
  onTogglePublish: (id: string, next: boolean) => void;
  onPriceSave: (id: string, price: number) => Promise<void>;
  onDelete: (service: BusinessService) => void;
}>) {
  const allSelected = services.length > 0 && services.every((s) => selectedIds.has(s.id));
  const toggleAll = () => onSelectedIdsChange(allSelected ? new Set() : new Set(services.map((s) => s.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const sortIcon = (col: ColumnKey) => {
    const sortCol = SORTABLE[col];
    if (!sortCol) return null;
    if (sort.column !== sortCol) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const headerButton = (col: ColumnKey, label: string) => {
    const sortCol = SORTABLE[col];
    if (!sortCol) return <span>{label}</span>;
    return (
      <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSortChange(sortCol)}>
        {label} {sortIcon(col)}
      </button>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="w-10 p-3"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>
            <th className="p-3 text-left">
              <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSortChange("name")}>
                Service Name
                {sort.column === "name" ? (sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
              </button>
            </th>
            <th className="p-3 text-left">Actions</th>
            {[...visibleColumns].map((col) => (
              <th key={col} className="p-3 text-left whitespace-nowrap">{headerButton(col, COLUMN_LABELS[col])}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="p-3"><Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} /></td>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Package className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{s.name}</span>
                </div>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => onEdit(s.id)} aria-label="Edit service"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onTogglePublish(s.id, !s.is_published)}
                    aria-label={s.is_published ? "Unpublish service" : "Publish service"}
                  >
                    {s.is_published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => onDelete(s)} aria-label="Delete service">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
              {visibleColumns.has("category") && (
                <td className="p-3">
                  {s.category_name ? <Badge variant="secondary" className="text-[10px]">{s.category_name}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              {visibleColumns.has("degree_level") && <td className="p-3 whitespace-nowrap">{s.degree_level ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("area_of_study") && <td className="p-3 whitespace-nowrap">{s.area_of_study ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("duration") && <td className="p-3 whitespace-nowrap">{s.duration ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("location") && <td className="p-3 whitespace-nowrap text-muted-foreground">—</td>}
              {visibleColumns.has("price") && (
                <td className="p-3 whitespace-nowrap">
                  <PriceEditPopover price={s.price} onSave={(next) => onPriceSave(s.id, next)} />
                </td>
              )}
              {visibleColumns.has("status") && (
                <td className="p-3">
                  <Badge variant={s.is_published ? "default" : "secondary"} className="text-[10px]">{s.is_published ? "Published" : "Draft"}</Badge>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
