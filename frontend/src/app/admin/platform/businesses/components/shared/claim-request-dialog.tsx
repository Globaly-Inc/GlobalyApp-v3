"use client";

import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Business } from "../../apis/types";

/**
 * `recipient` is resolved by the caller, from the row it already has, at the moment the button is
 * clicked. The dialog does not derive it: this list mixes businesses and institutions, and having
 * the dialog reach into row fields is how it ended up showing a blank address for every extracted
 * listing (those have no owner, so owner_email is null).
 */
export type ClaimRequestTarget =
  | { kind: "single"; business: Business; recipient: string | null }
  | { kind: "bulk"; count: number };

export function ClaimRequestDialog({
  target,
  onOpenChange,
  onConfirm,
  sending,
}: Readonly<{
  target: ClaimRequestTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  sending: boolean;
}>) {
  const isBulk = target?.kind === "bulk";
  const title = isBulk ? `Send ${target.count} claim requests` : "Send claim request";
  const confirmLabel = isBulk ? `Send ${target.count} requests` : "Send request";

  const recipient = target?.kind === "single" ? target.recipient : null;

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {isBulk ? (
            <p>
              This will email <strong className="text-foreground">{target.count}</strong> listing owners a link to
              claim their account. Each one will be marked &ldquo;Awaiting claim&rdquo; until they do.
            </p>
          ) : (
            <p>
              This will email <strong className="text-foreground">{recipient}</strong> a link to claim{" "}
              <strong className="text-foreground">{target?.business.business_name}</strong>. It will be marked
              &ldquo;Awaiting claim&rdquo; until they do.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button className="cursor-pointer" disabled={sending} onClick={onConfirm}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
