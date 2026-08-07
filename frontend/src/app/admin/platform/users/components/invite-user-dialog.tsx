"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { ADMIN_ROLES, ROLE_DISPLAY } from "../../../consts";
import { fetchAdmins, inviteAdmin } from "../store/users-slice";
import type { AdminRole } from "../apis/types";

export function InviteUserDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setName("");
      setEmail("");
      setRole("admin");
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    const result = await dispatch(inviteAdmin({ name: name.trim(), email: email.trim(), role }));
    setSaving(false);
    if (inviteAdmin.rejected.match(result)) {
      toast.error("Couldn't send invitation", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Invitation sent");
    dispatch(fetchAdmins({}));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              items={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_DISPLAY[r] }))}
              value={role}
              onValueChange={(v) => setRole((v as AdminRole) ?? "admin")}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADMIN_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="cursor-pointer" onClick={handleSubmit} disabled={saving}>{saving ? "Sending…" : "Send Invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
