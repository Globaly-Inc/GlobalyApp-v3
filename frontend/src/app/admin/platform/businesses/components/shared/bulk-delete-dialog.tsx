"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BulkDeleteDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
  deleting,
}: Readonly<{
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}>) {
  const [confirmText, setConfirmText] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmText("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} businesses</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            You are about to permanently delete <strong className="text-foreground">{count}</strong> businesses and
            all related data.
          </p>
          <p className="font-medium text-destructive">This action cannot be undone.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-confirm-delete">
              Type <span className="font-mono">DELETE</span> to confirm
            </Label>
            <Input
              id="bulk-confirm-delete"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" className="cursor-pointer" disabled={confirmText !== "DELETE" || deleting} onClick={onConfirm}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {count} permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
