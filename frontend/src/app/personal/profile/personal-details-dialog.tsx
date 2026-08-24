"use client";

import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GENDER_OPTIONS } from "../static/onboarding-content";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

type FormState = {
  firstName: string;
  lastName: string;
  nationalityId: string;
  countryOfResidenceId: string;
  cityOfResidence: string;
  dateOfBirth: string;
  gender: string;
};

const schema: z.ZodType<FormState> = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  nationalityId: z.string().min(1, "Required"),
  countryOfResidenceId: z.string().min(1, "Required"),
  cityOfResidence: z.string(),
  dateOfBirth: z.string().min(1, "Required"),
  gender: z.string().min(1, "Required"),
});

function toForm(profile: StudentProfile): FormState {
  return {
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    nationalityId: profile.nationality_id ? String(profile.nationality_id) : "",
    countryOfResidenceId: profile.country_of_residence_id ? String(profile.country_of_residence_id) : "",
    cityOfResidence: profile.city_of_residence ?? "",
    dateOfBirth: profile.date_of_birth?.split("T")[0] ?? "",
    gender: profile.gender ?? "",
  };
}

export function PersonalDetailsDialog({
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
    reset(toForm(profile));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      first_name: data.firstName,
      last_name: data.lastName,
      nationality_id: data.nationalityId ? Number(data.nationalityId) : null,
      country_of_residence_id: data.countryOfResidenceId ? Number(data.countryOfResidenceId) : null,
      city_of_residence: data.cityOfResidence || null,
      date_of_birth: data.dateOfBirth || null,
      gender: data.gender || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Edit Personal Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                aria-invalid={!!errors.firstName}
              />
              <FieldError message={errors.firstName} />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                aria-invalid={!!errors.lastName}
              />
              <FieldError message={errors.lastName} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>Nationality *</Label>
              <Combobox
                value={form.nationalityId}
                onChange={(v) => setForm((f) => ({ ...f, nationalityId: v }))}
                placeholder="Select nationality"
                searchPlaceholder="Search countries..."
                options={countryOptions}
                aria-invalid={!!errors.nationalityId}
              />
              <FieldError message={errors.nationalityId} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Date of Birth *</Label>
              <DatePicker
                value={form.dateOfBirth}
                onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                placeholder="Select date of birth"
                toYear={new Date().getFullYear()}
                disabled={(date) => date > new Date()}
                aria-invalid={!!errors.dateOfBirth}
              />
              <FieldError message={errors.dateOfBirth} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Gender *</Label>
              <Combobox
                value={form.gender}
                onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                placeholder="Select gender"
                options={GENDER_OPTIONS}
                aria-invalid={!!errors.gender}
              />
              <FieldError message={errors.gender} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Country of Residence *</Label>
              <Combobox
                value={form.countryOfResidenceId}
                onChange={(v) => setForm((f) => ({ ...f, countryOfResidenceId: v }))}
                placeholder="Select country"
                searchPlaceholder="Search countries..."
                options={countryOptions}
                aria-invalid={!!errors.countryOfResidenceId}
              />
              <FieldError message={errors.countryOfResidenceId} />
            </div>
            <div className="space-y-2">
              <Label>City of Residence</Label>
              <Input value={form.cityOfResidence} onChange={(e) => setForm((f) => ({ ...f, cityOfResidence: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
