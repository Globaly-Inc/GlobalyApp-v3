"use client";

import { useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { respondToInvite } from "../store/home-slice";
import type { PendingInvitesCardProps } from "../types";

/** Absent entirely when there is nothing pending — an empty card here would be noise, not information. */
export function PendingInvitesCard({ invites }: PendingInvitesCardProps) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const respond = async (inviteId: string, action: "accept" | "decline") => {
    setBusy(inviteId);
    const result = await dispatch(respondToInvite({ inviteId, action }));
    setBusy(null);
    if (respondToInvite.rejected.match(result)) {
      toast.error("Couldn't respond to the invitation", { description: result.error.message });
      return;
    }
    // The row is already gone from the store — no reload, no refetch. An invite actioned in another tab
    // resolves to 204 server-side, so it disappears here just as quietly.
    toast.success(action === "accept" ? "Invitation accepted" : "Invitation declined");
  };

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Building2 className="h-4 w-4 text-emerald-600" /> Business invites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {invites.map((invite) => (
          <div key={invite.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{invite.business_name ?? "A business"}</p>
              <p className="text-xs capitalize text-muted-foreground">Role: {invite.role}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Accept invitation"
              disabled={busy === invite.id}
              onClick={() => respond(invite.id, "accept")}
              className="text-emerald-600 hover:bg-emerald-500/10"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Decline invitation"
              disabled={busy === invite.id}
              onClick={() => respond(invite.id, "decline")}
              className="text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
