"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch } from "@/lib/hooks";
import { fetchInstitutionInvitations, inviteInstitutionMember } from "../../store/institution-detail-slice";

const schema = z.object({
  first_name: z.string().min(1, "Required").max(100),
  last_name: z.string().min(1, "Required").max(100),
  email: z.string().min(1, "Required").email("Enter a valid email"),
  phone: z.string(),
  role: z.string(),
});

type FormState = z.infer<typeof schema>;

const EMPTY_FORM: FormState = { first_name: "", last_name: "", email: "", phone: "", role: "member" };

export function InviteInstitutionMemberDialog({
  open,
  onOpenChange,
  institutionId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; institutionId: number }>) {
  const dispatch = useAppDispatch();
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) reset(EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    setSaving(true);
    try {
      await dispatch(
        inviteInstitutionMember({
          id: institutionId,
          input: {
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            email: data.email.trim(),
            phone: data.phone.trim() || null,
            role: data.role.trim() || "member",
          },
        }),
      ).unwrap();
      toast.success("Invitation sent");
      dispatch(fetchInstitutionInvitations({ id: institutionId, params: { page: 1 } }));
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't send invitation", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                aria-invalid={!!errors.first_name}
              />
              <FieldError message={errors.first_name} />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                aria-invalid={!!errors.last_name}
              />
              <FieldError message={errors.last_name} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Sending…" : "Send Invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
