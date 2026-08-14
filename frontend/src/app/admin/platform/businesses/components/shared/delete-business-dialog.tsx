"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Business } from "../../apis/types";

export function DeleteBusinessDialog({
  business,
  onOpenChange,
  onConfirm,
  deleting,
}: Readonly<{
  business: Business | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}>) {
  const [confirmName, setConfirmName] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmName("");
    onOpenChange(next);
  };

  return (
    <Dialog open={!!business} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete business</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            You are about to permanently delete <strong className="text-foreground">{business?.business_name}</strong>{" "}
            and all related data.
          </p>
          <p className="font-medium text-destructive">This action cannot be undone.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-business-name">Type the business name to confirm</Label>
            <Input
              id="confirm-business-name"
              placeholder={business?.business_name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="cursor-pointer"
            disabled={confirmName !== business?.business_name || deleting}
            onClick={onConfirm}
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
