"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GENDER_OPTIONS } from "../static/onboarding-content";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";

type FormState = {
  nationalityId: string;
  countryOfResidenceId: string;
  cityOfResidence: string;
  dateOfBirth: string;
  gender: string;
};

function toForm(profile: StudentProfile): FormState {
  return {
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
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));

  const handleOpenChange = (next: boolean) => {
    if (next) setForm(toForm(profile));
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const ok = await onSave({
      nationality_id: form.nationalityId ? Number(form.nationalityId) : null,
      country_of_residence_id: form.countryOfResidenceId ? Number(form.countryOfResidenceId) : null,
      city_of_residence: form.cityOfResidence || null,
      date_of_birth: form.dateOfBirth || null,
      gender: form.gender || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Personal Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nationality</Label>
            <Combobox
              value={form.nationalityId}
              onChange={(v) => setForm((f) => ({ ...f, nationalityId: v }))}
              placeholder="Select nationality"
              searchPlaceholder="Search countries..."
              options={countryOptions}
            />
          </div>
          <div className="space-y-2">
            <Label>Country of Residence</Label>
            <Combobox
              value={form.countryOfResidenceId}
              onChange={(v) => setForm((f) => ({ ...f, countryOfResidenceId: v }))}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              options={countryOptions}
            />
          </div>
          <div className="space-y-2">
            <Label>City of Residence</Label>
            <Input value={form.cityOfResidence} onChange={(e) => setForm((f) => ({ ...f, cityOfResidence: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <DatePicker
              value={form.dateOfBirth}
              onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
              placeholder="Select date of birth"
              toYear={new Date().getFullYear()}
              disabled={(date) => date > new Date()}
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v ?? "" }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
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
