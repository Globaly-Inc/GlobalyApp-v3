"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { confirmPosition } from "../store/home-slice";
import type { PendingPositionsCardProps } from "../types";

export function PendingPositionsCard({ positions }: PendingPositionsCardProps) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<number | null>(null);

  if (positions.length === 0) return null;

  const confirm = async (membershipId: number) => {
    setBusy(membershipId);
    const result = await dispatch(confirmPosition(membershipId));
    setBusy(null);
    if (confirmPosition.rejected.match(result)) {
      toast.error("Couldn't confirm the position", { description: result.error.message });
      return;
    }
    toast.success("Added to your work history");
  };

  return (
    <Card className="border-violet-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Briefcase className="h-4 w-4 text-violet-600" />
          {positions.some((p) => p.kind === "changed") ? "Position updates" : "New positions added"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {positions.map((position) => (
          <div key={position.membership_id} className="space-y-2 rounded-md border border-border px-2.5 py-2">
            {/* A position can change after an earlier confirmation — the copy has to say which case this is. */}
            {position.kind === "changed" ? (
              <p className="text-xs text-muted-foreground">
                Your position at <strong className="text-foreground">{position.business_name ?? "a business"}</strong>{" "}
                changed from <strong className="text-foreground">{position.previous_position}</strong> to{" "}
                <strong className="text-foreground">{position.position}</strong>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                You were added as <strong className="text-foreground">{position.position}</strong> at{" "}
                <strong className="text-foreground">{position.business_name ?? "a business"}</strong>. Confirm to add
                this to your work history.
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={busy === position.membership_id} onClick={() => confirm(position.membership_id)}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" render={<Link href="/personal/profile" />}>
                Edit details
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
