"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { fetchPlatformUsers, updatePlatformUser } from "../store/platform-users-slice";
import type { ListParams, PlatformUser } from "../apis/types";

export function SuspendPlatformUserDialog({
  user, refreshParams, onClose,
}: Readonly<{ user: PlatformUser | null; refreshParams: ListParams; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const activating = user ? user.account_status === 0 : false;
  const name = user ? `${user.first_name} ${user.last_name}` : "";

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const result = await dispatch(updatePlatformUser({ id: user.id, patch: { account_status: activating ? 1 : 0 } }));
    setSaving(false);
    if (updatePlatformUser.rejected.match(result)) {
      toast.error(`Couldn't ${activating ? "activate" : "suspend"} user`, {
        description: result.error.message ?? "Please try again.",
      });
      return;
    }
    toast.success(`${name} ${activating ? "activated" : "suspended"}`);
    dispatch(fetchPlatformUsers(refreshParams));
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activating ? "Activate" : "Suspend"} user?</DialogTitle>
          {user && (
            <DialogDescription>
              {activating
                ? <>This restores <strong>{name}</strong>&apos;s access to the platform.</>
                : <><strong>{name}</strong> will immediately lose access to the platform.</>}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button
            variant={activating ? "default" : "destructive"}
            className="cursor-pointer"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving ? "Working…" : activating ? "Activate" : "Suspend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
