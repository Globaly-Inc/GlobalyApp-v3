"use client";

import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

type FormState = {
  countryId: string;
  state: string;
  city: string;
  street: string;
  postcode: string;
  linkedinUrl: string;
  websiteUrl: string;
};

const urlField = z.string().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a valid URL");

const schema: z.ZodType<FormState> = z.object({
  countryId: z.string().min(1, "Required"),
  state: z.string(),
  city: z.string(),
  street: z.string(),
  postcode: z.string(),
  linkedinUrl: urlField,
  websiteUrl: urlField,
});

function toForm(profile: StudentProfile): FormState {
  return {
    countryId: profile.personal_address_country_id ? String(profile.personal_address_country_id) : "",
    state: profile.personal_address_state ?? "",
    city: profile.personal_address_city ?? "",
    street: profile.personal_address_street ?? "",
    postcode: profile.personal_address_postcode ?? "",
    linkedinUrl: profile.linkedin_url ?? "",
    websiteUrl: profile.website_url ?? "",
  };
}

export function ContactDialog({
  open,
  onOpenChange,
  profile,
  countries,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: StudentProfile;
  countries: Country[];
  onSave: (patch: StudentProfilePatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile));
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));

  const handleOpenChange = (next: boolean) => {
    if (next) reset(toForm(profile));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      personal_address_country_id: data.countryId ? Number(data.countryId) : null,
      personal_address_state: data.state || null,
      personal_address_city: data.city || null,
      personal_address_street: data.street || null,
      personal_address_postcode: data.postcode || null,
      linkedin_url: data.linkedinUrl || null,
      website_url: data.websiteUrl || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Contact Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Country *</Label>
            <Combobox
              value={form.countryId}
              onChange={(v) => setForm((f) => ({ ...f, countryId: v }))}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              options={countryOptions}
              aria-invalid={!!errors.countryId}
            />
            <FieldError message={errors.countryId} />
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
          <div className="space-y-2">
            <Label>Street Address</Label>
            <Input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Postcode</Label>
            <Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>LinkedIn URL</Label>
            <Input
              value={form.linkedinUrl}
              onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
              placeholder="https://linkedin.com/in/..."
              aria-invalid={!!errors.linkedinUrl}
            />
            <FieldError message={errors.linkedinUrl} />
          </div>
          <div className="space-y-2">
            <Label>Website URL</Label>
            <Input
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="https://..."
              aria-invalid={!!errors.websiteUrl}
            />
            <FieldError message={errors.websiteUrl} />
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
