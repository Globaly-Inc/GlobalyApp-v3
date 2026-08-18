"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/hooks";
import { promoteVerticalRow } from "../store/service-verticals-slice";
import type { VerticalRow, VerticalSlug } from "../apis/types";

/**
 * Promote asks for the target org and nothing else.
 *
 * The service category is resolved server-side from the vertical slug, and the
 * vertical's own fields go to business_services.category_specific_data — so there
 * is nothing here for an admin to map by hand. A scraped provider nobody has
 * claimed is an `institution`, which is the default the backend applies.
 */
export function PromoteVerticalDialog({
  row,
  slug,
  open,
  onOpenChange,
}: {
  row: VerticalRow;
  slug: VerticalSlug;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const [orgId, setOrgId] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = Number.isInteger(Number(orgId.trim())) && Number(orgId.trim()) > 0;

  const handlePromote = async () => {
    if (!valid) return;
    setBusy(true);
    const result = await dispatch(
      promoteVerticalRow({ slug, id: row.id, targetOrgId: Number(orgId.trim()) }),
    );
    setBusy(false);
    onOpenChange(false);
    if ("error" in result && result.error) {
      toast.error("Promote failed", { description: result.error.message });
      return;
    }
    toast.success("Promoted into the tenant catalog");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote to the live catalog</DialogTitle>
          <DialogDescription>
            Publishes &quot;{row.name}&quot; as a service under the target organisation. The service
            category is derived from the vertical; re-promoting the same row updates it in place.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Target institution ID</Label>
          <Input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="e.g. 42"
            inputMode="numeric"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="cursor-pointer" disabled={!valid || busy} onClick={handlePromote}>
            {busy ? "Promoting..." : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
