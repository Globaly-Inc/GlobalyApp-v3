"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { ADMIN_ROLES, ROLE_DISPLAY } from "../../../consts";
import { fetchUsers, updateAdmin } from "../store/users-slice";
import type { AdminRole, AdminUser } from "../apis/types";

export function EditUserRoleDialog({
  user, onClose,
}: Readonly<{ user: AdminUser | null; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [role, setRole] = useState<AdminRole>(user?.role ?? "admin");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    const result = await dispatch(updateAdmin({ id: user.id, patch: { role } }));
    setSaving(false);
    if (updateAdmin.rejected.match(result)) {
      toast.error("Couldn't update role", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Role updated");
    dispatch(fetchUsers({}));
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Role</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{user.name} · {user.email}</p>
            <Combobox
              options={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_DISPLAY[r] }))}
              value={role}
              onChange={(v) => setRole(v as AdminRole)}
              searchPlaceholder="Search roles…"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button className="cursor-pointer" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
