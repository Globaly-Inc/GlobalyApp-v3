"use client";

import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Spend confirmation. No internal state, so unlike CloseEnquiryDialog this needs no
 * remount key — there is nothing to reset between openings.
 */
export function ConfirmUnlockDialog({
  open,
  onOpenChange,
  onConfirm,
  courseName,
  unlockCost,
  credits,
  submitting,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  courseName: string | null;
  unlockCost: number;
  credits: number | null;
  submitting: boolean;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock this enquiry?</DialogTitle>
          <DialogDescription>
            {courseName
              ? `This will reveal the student's contact details for ${courseName}.`
              : "This will reveal the student's contact details."}{" "}
            Only 3 businesses can unlock the same enquiry.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <span>
            Costs <span className="font-semibold">{unlockCost} credits</span>
            {credits != null && (
              <span className="text-muted-foreground">
                {" "}
                · {credits} now, {credits - unlockCost} after
              </span>
            )}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? "Unlocking…" : `Yes, unlock for ${unlockCost}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
