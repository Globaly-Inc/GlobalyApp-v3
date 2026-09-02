"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
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
 * Confirms leaving a conversation — GlobalyOS V2's "Leave space" confirm, in Shadcn, shared by
 * both sides because the decision reads the same from either.
 *
 * It shows the server's error rather than closing on failure. That matters: whether someone may
 * leave depends on the state of the thread at the moment they click, and the panel's copy of that
 * can be seconds old — a colleague may have left in the meantime, making this person the last one.
 * The 409 lands here, in front of the button that caused it, instead of vanishing into a toast.
 */
export function LeaveThreadDialog({
  open,
  onOpenChange,
  description,
  onConfirm,
  onLeft,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What leaving costs this person — the two sides word it differently. */
  description: string;
  onConfirm: () => Promise<void>;
  /** Called after the server confirms. The caller decides where to send them next. */
  onLeft: () => void;
}>) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setLeaving(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
      onLeft();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave this conversation?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={leaving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={leaving}>
            {leaving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
