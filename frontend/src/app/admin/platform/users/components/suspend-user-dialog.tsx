"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { fetchUsers, updateAdmin } from "../store/users-slice";
import type { AdminUser } from "../apis/types";

export function SuspendUserDialog({
  user, onClose,
}: Readonly<{ user: AdminUser | null; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const activating = user ? !user.is_active : false;

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const result = await dispatch(updateAdmin({ id: user.id, patch: { is_active: activating } }));
    setSaving(false);
    if (updateAdmin.rejected.match(result)) {
      toast.error(`Couldn't ${activating ? "activate" : "suspend"} user`, {
        description: result.error.message ?? "Please try again.",
      });
      return;
    }
    toast.success(`${user.name} ${activating ? "activated" : "suspended"}`);
    dispatch(fetchUsers({}));
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activating ? "Activate" : "Suspend"} admin?</DialogTitle>
          {user && (
            <DialogDescription>
              {activating
                ? <>This restores <strong>{user.name}</strong>&apos;s admin access.</>
                : <><strong>{user.name}</strong> will immediately lose admin access.</>}
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
