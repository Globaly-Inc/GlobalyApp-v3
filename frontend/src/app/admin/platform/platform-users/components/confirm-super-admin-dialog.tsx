"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { fetchPlatformUsers, setPlatformUserAdminRole } from "../store/platform-users-slice";
import type { ListParams, PlatformUser } from "../apis/types";

export function ConfirmSuperAdminDialog({
  user, grant, refreshParams, onClose,
}: Readonly<{ user: PlatformUser | null; grant: boolean; refreshParams: ListParams; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const name = user ? user.first_name || user.email : "";

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const result = await dispatch(setPlatformUserAdminRole({ id: user.id, role: grant ? "super_admin" : null }));
    setSaving(false);
    if (setPlatformUserAdminRole.rejected.match(result)) {
      toast.error("Couldn't update role", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(grant ? `${name} is now Super Admin` : `Super Admin removed from ${name}`);
    dispatch(fetchPlatformUsers(refreshParams));
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{grant ? "Grant Super Admin?" : "Remove Super Admin?"}</DialogTitle>
          {user && (
            <DialogDescription>
              {grant
                ? <>This gives <strong>{name}</strong> full admin access to the platform.</>
                : <><strong>{name}</strong> will lose Super Admin access.</>}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button
            variant={grant ? "default" : "destructive"}
            className="cursor-pointer"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving ? "Working…" : grant ? "Grant Super Admin" : "Remove Super Admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
