"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FieldError } from "@/components/field-error";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { buildPhone, isValidEmail, isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";
import { geoApi, type Country } from "@/app/geo/apis";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInvitations, fetchMemberRoles, fetchMembers, inviteMember, updateMember } from "../../store/business-profile-detail-slice";
import type { Member } from "../../apis/types";

const EMPTY = { firstName: "", lastName: "", email: "", phoneCountryId: "", phoneNumber: "", role: "member" };

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

  const [countries, setCountries] = useState<Country[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [role, setRole] = useState("member");
  const [active, setActive] = useState(true);
  const [pointOfContact, setPointOfContact] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Re-seed when the drawer opens, or when a different member is handed in while it is
  // open. Derived by comparing against the previous props during render — seeding from
  // an effect would commit one render of the stale form first. Nothing is re-seeded
  // while closing, so the form does not flash empty behind the exit animation.
  const seedFor = open ? (editingMember ?? null) : undefined;
  const [seededFor, setSeededFor] = useState<Member | null | undefined>(undefined);
  if (seedFor !== seededFor && open) {
    if (editingMember) {
      setRole(editingMember.role ?? "member");
      setActive(editingMember.account_status === 1);
      setPointOfContact(editingMember.admin_point_of_contact);
      setIsOwner(editingMember.is_owner);
    } else {
      setForm(EMPTY);
      setRole("member");
      setActive(true);
      setPointOfContact(false);
      setIsOwner(false);
    }
    setErrors({});
  }
  if (seedFor !== seededFor) setSeededFor(seedFor);

  useEffect(() => {
    if (!open) return;
    if (roles.length === 0) dispatch(fetchMemberRoles());
    if (countries.length === 0) geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );
  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.name, label: r.display_name })), [roles]);

  const handleClose = () => {
    setForm(EMPTY);
    onOpenChange(false);
  };

  const canSubmit = isEdit || (form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && isValidEmail(form.email));

  const validate = () => {
    const nextErrors: Record<string, string | undefined> = {};
    if (form.phoneNumber.trim()) {
      if (!form.phoneCountryId) nextErrors.phone = "Select a country code";
      else if (!isValidPhoneForCountry(form.phoneNumber, countries.find((c) => String(c.id) === form.phoneCountryId)?.iso2)) {
        nextErrors.phone = "Enter a valid phone number for the selected country";
      }
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
            patch: { role, admin_point_of_contact: pointOfContact, account_status: active ? 1 : 0, is_owner: isOwner },
          }),
        ).unwrap();
        toast.success("Member updated");
      } else {
        const phoneCode = countries.find((c) => String(c.id) === form.phoneCountryId)?.phoneCode ?? "";
        const phone = buildPhone(phoneCode, form.phoneNumber);
        await dispatch(
          inviteMember({
            id: businessId,
            input: {
              first_name: form.firstName,
              last_name: form.lastName,
              email: form.email,
              phone: phone || null,
              role: form.role,
              admin_point_of_contact: pointOfContact,
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
                <div className="grid grid-cols-[160px_1fr] gap-3">
                  <Combobox
                    value={form.phoneCountryId}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, phoneCountryId: v }));
                      setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
                    }}
                    placeholder="Code"
                    searchPlaceholder="Search countries..."
                    options={phoneCountryOptions}
                  />
                  <Input
                    className="h-10"
                    aria-invalid={!!errors.phone}
                    value={form.phoneNumber}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, phoneNumber: e.target.value }));
                      setErrors((prev) => (prev.phone ? { ...prev, phone: undefined } : prev));
                    }}
                    placeholder="984 1234567"
                  />
                </div>
                <FieldError message={errors.phone} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Combobox value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} options={roleOptions} placeholder="Select role" />
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
