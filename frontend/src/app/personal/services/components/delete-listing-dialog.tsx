"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Listing } from "../apis";

/**
 * A real dialog, never `window.confirm` — V2 deleted listings behind a raw browser prompt with no check for
 * money committed against them.
 *
 * Two shapes in one component, because they are the same decision:
 *  - the listing has open orders → deletion is refused before it is attempted, and **Pause** is offered
 *    instead, so the seller has a way out rather than a dead end;
 *  - it has none → a plain confirmation.
 *
 * The server refuses either way (409); this only means the user is not sent down a path that cannot work.
 */
export function DeleteListingDialog({
  listing,
  open,
  busy,
  onOpenChange,
  onConfirm,
  onPause,
}: Readonly<{
  listing: Listing | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
}>) {
  if (!listing) return null;
  const openOrders = listing.open_orders_count;
  const blocked = openOrders > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{blocked ? "This listing can't be deleted yet" : "Delete this listing?"}</DialogTitle>
          <DialogDescription>
            {blocked ? (
              <>
                <strong>{listing.title}</strong> has {openOrders} {openOrders === 1 ? "order" : "orders"} in
                progress. Deleting it now would strand {openOrders === 1 ? "a payment" : "payments"}. Pause it
                instead — it stops appearing to buyers, stays here for you, and those orders finish normally.
              </>
            ) : (
              <>
                <strong>{listing.title}</strong> will stop appearing to buyers. Completed orders and their
                reviews stay in your history.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {blocked ? (
            listing.is_active && (
              <Button onClick={() => onPause(listing)} disabled={busy}>
                Pause instead
              </Button>
            )
          ) : (
            <Button variant="destructive" onClick={() => onConfirm(listing)} disabled={busy}>
              {busy ? "Deleting…" : "Delete listing"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small hook so the hub does not carry the dialog's open/target bookkeeping. */
export function useDeleteTarget() {
  const [target, setTarget] = useState<Listing | null>(null);
  return {
    target,
    open: target !== null,
    ask: setTarget,
    close: () => setTarget(null),
  };
}
