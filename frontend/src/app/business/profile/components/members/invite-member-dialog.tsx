"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { FieldError } from "@/components/field-error";
import { isValidEmail } from "@/app/admin/platform/businesses/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInvitations, fetchMemberRoles, inviteMember } from "../../store/business-profile-detail-slice";

/** Name, email, phone, role and position — the invite is pre-filled with who it's for. */
export function InviteMemberDialog({
  open,
  onOpenChange,
  businessId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; businessId: number }>) {
  const dispatch = useAppDispatch();
  const roles = useAppSelector((s) => s.businessProfileDetail.memberRoles);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("member");
  const [position, setPosition] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && roles.length === 0) dispatch(fetchMemberRoles());
  }, [open, roles.length, dispatch]);

  // "Admin — Administrative access": what each role can do, right in the picker.
  const roleOptions = useMemo(
    () => roles.map((r) => {
      const description = (r as { description?: string | null }).description;
      return { value: r.name, label: description ? `${r.display_name} — ${description}` : r.display_name };
    }),
    [roles],
  );

  const phoneError = phone.trim() && !isValidPhoneNumber(phone) ? "Enter a valid phone number" : undefined;
  const canSend = firstName.trim() !== "" && lastName.trim() !== "" && isValidEmail(email.trim()) && !phoneError;

  const close = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setRole("member");
    setPosition("");
    onOpenChange(false);
  };

  const send = async () => {
    setSending(true);
    try {
      await dispatch(inviteMember({ id: businessId, input: {
        first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(),
        phone: phone.trim() || null, role, position: position.trim() || null,
      } })).unwrap();
      toast.success("Invitation sent", { description: `${email.trim()} will appear in the team once they accept.` });
      dispatch(fetchInvitations({ id: businessId }));
      close();
    } catch (e) {
      toast.error("Couldn't send invitation", { description: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-first">First Name <span className="text-destructive">*</span></Label>
              <Input id="invite-first" className="h-10" maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-last">Last Name <span className="text-destructive">*</span></Label>
              <Input id="invite-last" className="h-10" maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label>
            <Input id="invite-email" className="h-10" type="email" maxLength={255} value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <PhoneInput aria-invalid={!!phoneError} value={phone} onChange={setPhone} placeholder="(201) 555-0123" />
            <FieldError message={phoneError} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Combobox value={role} onChange={setRole} options={roleOptions} placeholder="Select role" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-position">
              Position / Job Title <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="invite-position" className="h-10" maxLength={255} value={position}
              onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Admissions Officer" />
          </div>
          <p className="text-xs text-muted-foreground">
            An invitation will be sent to this email. They&apos;ll need to sign in or sign up to accept.
          </p>
          <Button className="h-10 w-full" disabled={!canSend || sending} onClick={send}>
            {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Send Invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
