"use client";

import { Columns3, RotateCcw, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { MAX_FROZEN_COLUMNS, type ColumnDefinition } from "@/lib/use-column-preferences";
import { cn } from "@/lib/utils";

/** Column visibility + pinning for the service management table (V1's ServiceColumnPicker). */
export function ServiceColumnPicker({
  allColumns,
  visibleColumns,
  frozenColumns,
  onToggleColumn,
  onToggleFreeze,
  onReset,
}: Readonly<{
  allColumns: ColumnDefinition[];
  visibleColumns: string[];
  frozenColumns: string[];
  onToggleColumn: (key: string) => void;
  onToggleFreeze: (key: string) => void;
  onReset: () => void;
}>) {
  const freezeLimitReached = frozenColumns.length >= MAX_FROZEN_COLUMNS;

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-10 gap-1.5" />}>
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="end">
        <div className="space-y-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Toggle columns</p>
            <span className="text-[10px] text-muted-foreground">
              Pin {frozenColumns.length}/{MAX_FROZEN_COLUMNS}
            </span>
          </div>
          {allColumns.map((col) => {
            // Locked columns are always shown, whatever a stale stored preference says.
            const isVisible = col.locked || visibleColumns.includes(col.key);
            const isFrozen = frozenColumns.includes(col.key);
            const canFreeze = isFrozen || !freezeLimitReached;
            let freezeTitle = "Freeze column";
            if (isFrozen) freezeTitle = "Unfreeze column";
            else if (freezeLimitReached) freezeTitle = `Max ${MAX_FROZEN_COLUMNS} pinned`;
            return (
              <div key={col.key} className="flex items-center justify-between py-1">
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <Checkbox checked={isVisible} onCheckedChange={() => onToggleColumn(col.key)} disabled={col.locked} />
                  <span className="text-xs">{col.label}</span>
                </label>
                {isVisible && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={freezeTitle}
                    aria-label={freezeTitle}
                    disabled={!canFreeze}
                    className={cn(isFrozen ? "text-primary" : "text-muted-foreground")}
                    onClick={() => onToggleFreeze(col.key)}
                  >
                    <Snowflake className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
          <Separator className="my-2" />
          <Button variant="ghost" size="sm" className="w-full" onClick={onReset}>
            <RotateCcw className="h-3 w-3" /> Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
