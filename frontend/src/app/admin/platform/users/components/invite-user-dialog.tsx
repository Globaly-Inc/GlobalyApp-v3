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

const firstNameSchema = z.string().trim().min(1, "First name is required");
const lastNameSchema = z.string().trim().min(1, "Last name is required");
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setRole("admin");
      setFirstNameError(null);
      setLastNameError(null);
      setEmailError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const firstNameResult = firstNameSchema.safeParse(firstName);
    const lastNameResult = lastNameSchema.safeParse(lastName);
    const emailResult = emailSchema.safeParse(email);
    setFirstNameError(firstNameResult.success ? null : (firstNameResult.error.issues[0]?.message ?? "Invalid first name"));
    setLastNameError(lastNameResult.success ? null : (lastNameResult.error.issues[0]?.message ?? "Invalid last name"));
    setEmailError(emailResult.success ? null : (emailResult.error.issues[0]?.message ?? "Invalid email"));
    if (!firstNameResult.success || !lastNameResult.success || !emailResult.success) return;

    setSaving(true);
    const result = await dispatch(
      inviteAdmin({ first_name: firstNameResult.data, last_name: lastNameResult.data, email: emailResult.data, role }),
    );
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>
                First Name <span className={firstNameError ? "text-destructive" : ""}>*</span>
              </Label>
              <Input
                className="h-10"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (firstNameError) setFirstNameError(null);
                }}
                aria-invalid={!!firstNameError}
              />
              {firstNameError && <p className="text-sm text-destructive">{firstNameError}</p>}
            </div>
            <div className="space-y-2">
              <Label>
                Last Name <span className={lastNameError ? "text-destructive" : ""}>*</span>
              </Label>
              <Input
                className="h-10"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (lastNameError) setLastNameError(null);
                }}
                aria-invalid={!!lastNameError}
              />
              {lastNameError && <p className="text-sm text-destructive">{lastNameError}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>
              Email <span className={emailError ? "text-destructive" : ""}>*</span>
            </Label>
            <Input
              className="h-10"
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
