"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/field-error";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidEmail } from "@/app/admin/platform/businesses/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInvitations, fetchMemberRoles, fetchMembers, inviteMember, updateMember } from "../../store/business-profile-detail-slice";
import type { Member } from "../../apis/types";

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", role: "member", position: "" };

export function AddMemberDrawer({
  open,
  onOpenChange,
  businessId,
  editingMember = null,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: number;
  editingMember?: Member | null;
}>) {
  const dispatch = useAppDispatch();
  const roles = useAppSelector((s) => s.businessProfileDetail.memberRoles);
  const isEdit = !!editingMember;

  const [form, setForm] = useState(EMPTY);
  const [role, setRole] = useState("member");
  const [active, setActive] = useState(true);
  const [pointOfContact, setPointOfContact] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    if (roles.length === 0) dispatch(fetchMemberRoles());
    if (editingMember) {
      setRole(editingMember.role ?? "member");
      setActive(editingMember.account_status === 1);
      setPointOfContact(editingMember.admin_point_of_contact);
      setIsOwner(editingMember.is_owner);
      setIsPublic(editingMember.is_public);
      setForm((f) => ({ ...f, position: editingMember.position ?? "" }));
    } else {
      setForm(EMPTY);
      setRole("member");
      setActive(true);
      setPointOfContact(false);
      setIsOwner(false);
      setIsPublic(false);
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingMember]);

  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.name, label: r.display_name })), [roles]);

  const handleClose = () => {
    setForm(EMPTY);
    onOpenChange(false);
  };

  const canSubmit = isEdit || (form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && isValidEmail(form.email));

  const validate = () => {
    const nextErrors: Record<string, string | undefined> = {};
    if (form.phone.trim() && !isValidPhoneNumber(form.phone)) {
      nextErrors.phone = "Enter a valid phone number";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!isEdit && !validate()) return;
    setSaving(true);
    try {
      if (isEdit && editingMember) {
        await dispatch(
          updateMember({
            id: businessId,
            memberId: editingMember.id,
            patch: {
              role, admin_point_of_contact: pointOfContact, account_status: active ? 1 : 0, is_owner: isOwner,
              position: form.position.trim() || null, is_public: isPublic,
            },
          }),
        ).unwrap();
        toast.success("Member updated");
      } else {
        await dispatch(
          inviteMember({
            id: businessId,
            input: {
              first_name: form.firstName,
              last_name: form.lastName,
              email: form.email,
              phone: form.phone || null,
              role: form.role,
              admin_point_of_contact: pointOfContact,
              position: form.position.trim() || null,
            },
          }),
        ).unwrap();
        toast.success("Invitation sent", { description: `${form.email} will appear here once they accept.` });
      }
      if (isEdit) dispatch(fetchMembers({ id: businessId }));
      else dispatch(fetchInvitations({ id: businessId }));
      handleClose();
    } catch (e) {
      toast.error(isEdit ? "Couldn't update member" : "Couldn't send invitation", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const heading = isEdit
    ? `Edit ${editingMember ? `${editingMember.first_name} ${editingMember.last_name}` : "member"}`
    : "Add Member";
  const subheading = isEdit
    ? "Name, email, and phone belong to this person's own account and can't be edited here."
    : "Invites this person to join the business — they land in the team once they accept.";
  const submitLabel = isEdit ? "Save changes" : "Invite member";

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>{subheading}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {isEdit ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Email</Label>
                  <p className="truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">{editingMember?.email ?? "—"}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Phone</Label>
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{editingMember?.phone ?? "—"}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Combobox value={role} onChange={setRole} options={roleOptions} placeholder="Select role" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Position / job title</Label>
                <Input className="h-10" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="e.g. Admissions Officer" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
                <Label className="font-normal">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={pointOfContact} onCheckedChange={(checked) => setPointOfContact(checked === true)} />
                <Label className="font-normal">Point of contact for super admin</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={isOwner} onCheckedChange={(checked) => setIsOwner(checked === true)} disabled={editingMember?.is_owner} />
                <Label className="font-normal">Make business owner</Label>
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Show on public profile</Label>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>
                    First name <span className="text-destructive">*</span>
                  </Label>
                  <Input className="h-10" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>
                    Last name <span className="text-destructive">*</span>
                  </Label>
                  <Input className="h-10" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input className="h-10" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Phone</Label>
                <PhoneInput
                  aria-invalid={!!errors.phone}
                  value={form.phone}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, phone: v }));
                    setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
                  }}
                  placeholder="(201) 555-0123"
                />
                <FieldError message={errors.phone} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Combobox value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} options={roleOptions} placeholder="Select role" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Position / job title <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input className="h-10" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="e.g. Admissions Officer" />
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? (isEdit ? "Saving…" : "Sending…") : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
