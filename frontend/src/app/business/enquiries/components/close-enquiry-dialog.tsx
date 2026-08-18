"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MIN_REASON = 3;

/**
 * Close-reason form. The parent remounts this via a changing `key` rather than
 * relying on onOpenChange to reset it — opening the dialog by setting `open`
 * directly never fires onOpenChange, so state would otherwise survive between
 * openings and show the previous row's reason.
 */
export function CloseEnquiryDialog({
  open,
  onOpenChange,
  onConfirm,
  leadLabel,
  submitting,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  leadLabel: string | null;
  submitting: boolean;
}>) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  const handleSubmit = () => {
    setTouched(true);
    if (tooShort) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this enquiry</DialogTitle>
          <DialogDescription>
            {leadLabel ? `Why are you closing ${leadLabel}?` : "Why are you closing this enquiry?"}
            {" Your reason is recorded against your business only — other businesses keep their own."}
          </DialogDescription>
        </DialogHeader>

        {/* flex+gap, not space-y — see frontend/AGENTS.md on dialog field spacing. */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="close-reason">Close reason</Label>
          <Textarea
            id="close-reason"
            rows={4}
            value={reason}
            placeholder="e.g. Student is outside the regions we service."
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && tooShort && (
            <p className="text-sm text-destructive">Please give a reason of at least {MIN_REASON} characters.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || (touched && tooShort)}>
            {submitting ? "Closing…" : "Close enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
