"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { COLUMN_LABELS, type ColumnKey } from "./service-management-table";

const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as ColumnKey[];

export function ServiceColumnPicker({
  visibleColumns,
  onChange,
}: Readonly<{ visibleColumns: Set<ColumnKey>; onChange: (next: Set<ColumnKey>) => void }>) {
  const toggle = (col: ColumnKey) => {
    const next = new Set(visibleColumns);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    onChange(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-10 gap-1.5" />}>
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-2">
        <div className="flex flex-col gap-2">
          {ALL_COLUMNS.map((col) => (
            <Label key={col} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={visibleColumns.has(col)} onCheckedChange={() => toggle(col)} />
              {COLUMN_LABELS[col]}
            </Label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
