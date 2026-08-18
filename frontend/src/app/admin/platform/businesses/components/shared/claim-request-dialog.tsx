"use client";

import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Business } from "../../apis/types";

export type ClaimRequestTarget = { kind: "single"; business: Business } | { kind: "bulk"; count: number };

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

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {isBulk ? (
            <p>
              This will email <strong className="text-foreground">{target.count}</strong> business owners a link to
              claim their account. Each business will be marked &ldquo;Awaiting claim&rdquo; until they do.
            </p>
          ) : (
            <p>
              This will email <strong className="text-foreground">{target?.business.owner_email}</strong> a link to
              claim <strong className="text-foreground">{target?.business.business_name}</strong>. The business will
              be marked &ldquo;Awaiting claim&rdquo; until they do.
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
