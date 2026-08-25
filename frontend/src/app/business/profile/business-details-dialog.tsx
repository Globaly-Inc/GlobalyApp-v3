"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { FieldError } from "@/components/field-error";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useValidatedForm } from "@/lib/use-validated-form";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";
import { splitPhone, toNumberOrNull } from "@/lib/utils";
import type { PlaceDetails } from "@/lib/api/places";
import type { Country } from "../../geo/apis";
import { businessApi } from "../apis";
import type { BusinessCategoryOption, BusinessProfile, BusinessProfilePatch } from "../apis/types";

// The API sends the icon as a lucide icon NAME (e.g. "Building2"); render it, don't print it.
const toCategoryOptions = (cats: BusinessCategoryOption[]): ComboboxOption[] =>
  cats.map((c) => ({
    value: c.value,
    label: c.label,
    description: c.description ?? undefined,
    icon: <DynamicIcon name={c.icon} fallback="Building2" className="h-4 w-4" />,
  }));

type FormState = {
  categoryId: string;
  email: string;
  phoneCountryId: string;
  phoneNumber: string;
  description: string;
  website: string;
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
    categoryId: z.string().min(1, REQUIRED),
    email: z.string().min(1, REQUIRED).pipe(z.email("Enter a valid email")),
    phoneCountryId: z.string().min(1, REQUIRED),
    phoneNumber: z.string().min(1, REQUIRED),
    description: z.string().min(1, REQUIRED),
    website: z.string().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL"),
    countryId: z.string().min(1, REQUIRED),
    state: z.string().min(1, REQUIRED),
    city: z.string().min(1, REQUIRED),
    address: z.string().min(1, REQUIRED),
    postcode: z.string().min(1, REQUIRED),
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


function toForm(profile: BusinessProfile, countries: Country[]): FormState {
  const { phoneCountryId, phoneNumber } = splitPhone(profile.phone, countries);
  return {
    categoryId: profile.business_category_id ? String(profile.business_category_id) : "",
    email: profile.email ?? "",
    phoneCountryId,
    phoneNumber,
    description: profile.description ?? "",
    website: profile.website ?? "",
    countryId: profile.country_id ? String(profile.country_id) : "",
    state: profile.state ?? "",
    city: profile.city ?? "",
    address: profile.address ?? "",
    postcode: profile.postcode ?? "",
    latitude: toNumberOrNull(profile.latitude),
    longitude: toNumberOrNull(profile.longitude),
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
  const schema = useMemo(() => buildSchema(countries), [countries]);
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile, countries));
  const [categoryOptions, setCategoryOptions] = useState<ComboboxOption[]>([]);
  const categorySearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const countryIso2 = countries.find((c) => String(c.id) === form.countryId)?.iso2;
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

  useEffect(() => {
    if (!open) return;
    reset(toForm(profile, countries));
    businessApi.getBusinessCategories().then((cats) => setCategoryOptions(toCategoryOptions(cats)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countries]);

  const handleCategoryQueryChange = (query: string) => {
    clearTimeout(categorySearchTimerRef.current);
    categorySearchTimerRef.current = setTimeout(() => {
      businessApi.getBusinessCategories(query).then((cats) => setCategoryOptions(toCategoryOptions(cats)));
    }, 300);
  };

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
      business_category_id: Number(data.categoryId),
      email: data.email,
      phone: [phoneCode, data.phoneNumber].filter(Boolean).join(" "),
      description: data.description,
      website: data.website || null,
      country_id: Number(data.countryId),
      state: data.state,
      city: data.city,
      address: data.address,
      postcode: data.postcode,
      latitude: data.latitude,
      longitude: data.longitude,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" style={{ maxWidth: "48rem" }}>
        <DialogHeader>
          <DialogTitle>Edit Business Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Business Type *</Label>
            <Combobox
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              placeholder="Select business type"
              searchPlaceholder="Search categories..."
              options={categoryOptions}
              onQueryChange={handleCategoryQueryChange}
              aria-invalid={!!errors.categoryId}
            />
            <FieldError message={errors.categoryId} />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              className="h-10"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={!!errors.email}
              required
            />
            <FieldError message={errors.email} />
          </div>
          <div className="space-y-2">
            <Label>Phone *</Label>
            <div className="grid grid-cols-3 gap-3">
              <Combobox
                value={form.phoneCountryId}
                onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
                options={phoneCountryOptions}
                placeholder="Code"
                searchPlaceholder="Search countries..."
                aria-invalid={!!errors.phoneCountryId}
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
            <FieldError message={errors.phoneCountryId ?? errors.phoneNumber} />
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              className="min-h-20"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              aria-invalid={!!errors.description}
              required
            />
            <FieldError message={errors.description} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              className="h-10"
              type="url"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              aria-invalid={!!errors.website}
              placeholder="https://example.com"
            />
            <FieldError message={errors.website} />
          </div>
          <div className="grid grid-cols-3 gap-3">
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
            <div className="col-span-2 flex flex-col gap-2">
              <Label>Address *</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onResolved={handlePlaceResolved}
                countryIso2={countryIso2}
              />
              <FieldError message={errors.address} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>State *</Label>
              <Input
                className="h-10"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                aria-invalid={!!errors.state}
                required
              />
              <FieldError message={errors.state} />
            </div>
            <div className="space-y-2">
              <Label>City *</Label>
              <Input
                className="h-10"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                aria-invalid={!!errors.city}
                required
              />
              <FieldError message={errors.city} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Postcode *</Label>
            <Input
              className="h-10"
              value={form.postcode}
              onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
              aria-invalid={!!errors.postcode}
              required
            />
            <FieldError message={errors.postcode} />
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
