"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BusinessService } from "../../apis/types";

export function DeleteServiceDialog({
  service,
  onOpenChange,
  onConfirm,
  deleting,
}: Readonly<{
  service: BusinessService | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}>) {
  return (
    <Dialog open={!!service} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete service</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Delete <strong className="text-foreground">{service?.name}</strong>? This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" className="cursor-pointer" onClick={onConfirm} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
