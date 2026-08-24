"use client";

import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = Readonly<{
  selectedCount: number;
  selectablePublishCount: number;
  bulkBusy: boolean;
  confirmBulkDelete: boolean;
  onConfirmBulkDeleteChange: (open: boolean) => void;
  onClear: () => void;
  onPublish: () => void;
  onDelete: () => void;
}>;

/** Floating selection toolbar for bulk publish/delete — split out to keep jobs-list.tsx under the line cap. */
export function JobsBulkBar({
  selectedCount,
  selectablePublishCount,
  bulkBusy,
  confirmBulkDelete,
  onConfirmBulkDeleteChange,
  onClear,
  onPublish,
  onDelete,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <span className="text-xs text-muted-foreground">({selectablePublishCount} publishable)</span>
      <Button variant="ghost" size="sm" className="h-8 cursor-pointer" onClick={onClear}>
        Clear
      </Button>
      <Button
        size="sm"
        className="h-8 gap-1.5 cursor-pointer"
        disabled={bulkBusy || selectablePublishCount === 0}
        onClick={onPublish}
      >
        <Upload className="h-3.5 w-3.5" />
        Publish {selectablePublishCount} to Business
      </Button>
      <Dialog open={confirmBulkDelete} onOpenChange={onConfirmBulkDeleteChange}>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 gap-1.5 cursor-pointer"
          disabled={bulkBusy}
          onClick={() => onConfirmBulkDeleteChange(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete {selectedCount}
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} extraction{selectedCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all extracted data for the selected job
              {selectedCount === 1 ? "" : "s"}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => onConfirmBulkDeleteChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="cursor-pointer" onClick={onDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
