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
  leadLabel,
  unlockCost,
  credits,
  submitting,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  leadLabel: string | null;
  unlockCost: number;
  credits: number | null;
  submitting: boolean;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock this enquiry?</DialogTitle>
          {/* No unlock cap to warn about: this module caps how many businesses a
              lead is distributed to, not how many of them may pay for it. Every
              business that received it can unlock its own copy. */}
          <DialogDescription>
            {leadLabel
              ? `This will reveal the full message and contact details for ${leadLabel}.`
              : "This will reveal the full message and the student's contact details."}{" "}
            Other businesses this lead was matched to can unlock their own copy too.
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
