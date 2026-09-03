"use client";

import { useEffect, useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";
import { splitPhone, toNumberOrNull } from "@/lib/utils";
import type { PlaceDetails } from "@/lib/api/places";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

type FormState = {
  phoneCountryId: string;
  phoneNumber: string;
  countryId: string;
  state: string;
  city: string;
  address: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
};

const REQUIRED = "This field is required";

function buildSchema(countries: Country[]): z.ZodType<FormState> {
  return z.object({
    phoneCountryId: z.string().min(1, REQUIRED),
    phoneNumber: z.string().min(1, REQUIRED),
    countryId: z.string().min(1, REQUIRED),
    state: z.string(),
    city: z.string(),
    address: z.string(),
    postcode: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }).superRefine((data, ctx) => {
    if (!data.phoneCountryId || !data.phoneNumber) return;
    const iso2 = countries.find((c) => String(c.id) === data.phoneCountryId)?.iso2;
    if (!isValidPhoneForCountry(data.phoneNumber, iso2)) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "Enter a valid phone number for the selected country" });
    }
  });
}

function toForm(profile: StudentProfile, countries: Country[]): FormState {
  const { phoneCountryId, phoneNumber } = splitPhone(profile.phone, countries);
  return {
    phoneCountryId,
    phoneNumber,
    countryId: profile.personal_address_country_id ? String(profile.personal_address_country_id) : "",
    state: profile.personal_address_state ?? "",
    city: profile.personal_address_city ?? "",
    address: profile.personal_address_street ?? "",
    postcode: profile.personal_address_postcode ?? "",
    latitude: toNumberOrNull(profile.latitude),
    longitude: toNumberOrNull(profile.longitude),
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
  const schema = useMemo(() => buildSchema(countries), [countries]);
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile, countries));
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const countryIso2 = countries.find((c) => String(c.id) === form.countryId)?.iso2;
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

  useEffect(() => {
    if (open) reset(toForm(profile, countries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countries]);

  const handlePlaceResolved = (details: PlaceDetails) => {
    setForm((f) => ({
      ...f,
      latitude: details.latitude,
      longitude: details.longitude,
      city: details.city ?? f.city,
      state: details.state ?? f.state,
      postcode: details.postcode ?? f.postcode,
    }));
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const phoneCode = countries.find((c) => String(c.id) === data.phoneCountryId)?.phoneCode ?? "";
    const ok = await onSave({
      phone: [phoneCode, data.phoneNumber].filter(Boolean).join(" "),
      // Home address doubles as country of residence — no separate field, one less thing to fill in.
      country_of_residence_id: Number(data.countryId),
      personal_address_country_id: Number(data.countryId),
      personal_address_state: data.state || null,
      personal_address_city: data.city || null,
      personal_address_street: data.address || null,
      personal_address_postcode: data.postcode || null,
      latitude: data.latitude,
      longitude: data.longitude,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" style={{ maxWidth: "48rem" }}>
        <DialogHeader>
          <DialogTitle>Edit contact details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Phone *</Label>
            <div className="grid grid-cols-3 gap-3">
              <Combobox
                value={form.phoneCountryId}
                onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
                options={phoneCountryOptions}
                placeholder="Code"
                searchPlaceholder="Search countries..."
              />
              <Input
                className="h-10 col-span-2"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                aria-invalid={!!errors.phoneNumber}
                placeholder="984 1234567"
                required
              />
            </div>
            <FieldError message={errors.phoneNumber} />
          </div>

          <p className="text-sm font-medium text-foreground">Personal Address</p>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="flex flex-col gap-2">
              <Label>Address</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onResolved={handlePlaceResolved}
                countryIso2={countryIso2}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input className="h-10" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>State/Province</Label>
              <Input className="h-10" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input className="h-10" value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} />
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
