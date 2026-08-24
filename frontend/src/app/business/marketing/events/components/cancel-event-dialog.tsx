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

export function CancelEventDialog({
  open,
  onOpenChange,
  onConfirm,
  eventTitle,
  submitting,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  eventTitle: string | null;
  submitting: boolean;
}>) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this event</DialogTitle>
          <DialogDescription>
            {eventTitle ? `Cancel "${eventTitle}"? ` : "Cancel this event? "}
            Registrants keep their RSVP record but the event will show as cancelled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            placeholder="e.g. Venue unavailable."
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep event
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim())} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
