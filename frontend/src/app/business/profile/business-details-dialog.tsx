"use client";

import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useValidatedForm } from "@/lib/use-validated-form";
import type { Country } from "../../geo/apis";
import type { BusinessProfile, BusinessProfilePatch, BusinessType } from "../apis/types";
import { BUSINESS_TYPES } from "../static/onboarding-content";

type FormState = {
  businessType: string;
  email: string;
  phone: string;
  description: string;
  countryId: string;
  state: string;
  city: string;
  address: string;
  postcode: string;
};

const schema: z.ZodType<FormState> = z.object({
  businessType: z.string(),
  email: z.string().refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email"),
  phone: z.string(),
  description: z.string(),
  countryId: z.string(),
  state: z.string(),
  city: z.string(),
  address: z.string(),
  postcode: z.string(),
});

function toForm(profile: BusinessProfile): FormState {
  return {
    businessType: profile.business_type ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    description: profile.description ?? "",
    countryId: profile.country_id ? String(profile.country_id) : "",
    state: profile.state ?? "",
    city: profile.city ?? "",
    address: profile.address ?? "",
    postcode: profile.postcode ?? "",
  };
}

export function BusinessDetailsDialog({
  open,
  onOpenChange,
  profile,
  countries,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile;
  countries: Country[];
  onSave: (patch: BusinessProfilePatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile));
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const businessTypeOptions = BUSINESS_TYPES.map((t) => ({ value: t.value, label: t.title }));

  const handleOpenChange = (next: boolean) => {
    if (next) reset(toForm(profile));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      business_type: (data.businessType || null) as BusinessType | null,
      email: data.email || null,
      phone: data.phone || null,
      description: data.description || null,
      country_id: data.countryId ? Number(data.countryId) : null,
      state: data.state || null,
      city: data.city || null,
      address: data.address || null,
      postcode: data.postcode || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Business Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Business Type</Label>
            <Combobox
              value={form.businessType}
              onChange={(v) => setForm((f) => ({ ...f, businessType: v }))}
              placeholder="Select business type"
              options={businessTypeOptions}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} aria-invalid={!!errors.email} />
              <FieldError message={errors.email} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea className="min-h-20" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Country</Label>
            <Combobox
              value={form.countryId}
              onChange={(v) => setForm((f) => ({ ...f, countryId: v }))}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              options={countryOptions}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
