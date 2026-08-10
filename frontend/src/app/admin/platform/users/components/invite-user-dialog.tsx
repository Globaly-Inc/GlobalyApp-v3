"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { ADMIN_ROLES, ROLE_DISPLAY } from "../../../consts";
import { fetchAdmins, inviteAdmin } from "../store/users-slice";
import type { AdminRole } from "../apis/types";

const nameSchema = z.string().trim().min(1, "Name is required");
const emailSchema = z
  .string()
  .trim()
  .max(255, "Email must be less than 255 characters")
  .pipe(z.email("Invalid email address"));

export function InviteUserDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setName("");
      setEmail("");
      setRole("admin");
      setNameError(null);
      setEmailError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const nameResult = nameSchema.safeParse(name);
    const emailResult = emailSchema.safeParse(email);
    setNameError(nameResult.success ? null : (nameResult.error.issues[0]?.message ?? "Invalid name"));
    setEmailError(emailResult.success ? null : (emailResult.error.issues[0]?.message ?? "Invalid email"));
    if (!nameResult.success || !emailResult.success) return;

    setSaving(true);
    const result = await dispatch(inviteAdmin({ name: nameResult.data, email: emailResult.data, role }));
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
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-invalid={!!emailError}
            />
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Combobox
              options={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_DISPLAY[r] }))}
              value={role}
              onChange={(v) => setRole(v as AdminRole)}
              searchPlaceholder="Search roles…"
            />
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
