"use client";

import { CheckSquare, Eye, EyeOff, Link2, Pencil, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BulkAction = "update_fields" | "assign_shared" | "publish" | "unpublish" | "delete";

const ACTIONS: { action: BulkAction; label: string; icon: typeof Pencil; destructive?: boolean }[] = [
  { action: "update_fields", label: "Update fields", icon: Pencil },
  { action: "assign_shared", label: "Assign", icon: Link2 },
  { action: "publish", label: "Publish", icon: Eye },
  { action: "unpublish", label: "Unpublish", icon: EyeOff },
  { action: "delete", label: "Delete", icon: Trash2, destructive: true },
];

/** Floating bar that appears over the table while rows are selected (V1's ServiceBulkActionsBar). */
export function ServiceBulkActionsBar({
  selectedCount,
  totalItems,
  onSelectAll,
  onDeselectAll,
  onAction,
}: Readonly<{
  selectedCount: number;
  totalItems: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAction: (action: BulkAction) => void;
}>) {
  const allSelected = totalItems > 0 && selectedCount === totalItems;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-primary">
          <span className="text-sm font-semibold">{selectedCount}</span>
          <span className="text-xs text-primary/80">of {totalItems}</span>
        </div>
        <Button variant="outline" size="sm" onClick={allSelected ? onDeselectAll : onSelectAll}>
          {allSelected ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {selectedCount} service{selectedCount === 1 ? "" : "s"} selected
        </span>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        {ACTIONS.map(({ action, label, icon: Icon, destructive }) => (
          <Button
            key={action}
            variant="ghost"
            size="sm"
            className={destructive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : undefined}
            onClick={() => onAction(action)}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>

      <div className="h-6 w-px bg-border" />

      <Button variant="ghost" size="icon-sm" onClick={onDeselectAll} aria-label="Cancel selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
