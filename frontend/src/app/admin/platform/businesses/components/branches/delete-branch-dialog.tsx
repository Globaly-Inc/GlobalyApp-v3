"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Branch } from "../../apis/types";

export function DeleteBranchDialog({
  branch,
  onOpenChange,
  onConfirm,
  deleting,
}: Readonly<{
  branch: Branch | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}>) {
  return (
    <Dialog open={!!branch} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove branch</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Remove <strong className="text-foreground">{branch?.name}</strong>? This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" className="cursor-pointer" onClick={onConfirm} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
