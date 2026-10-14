"use client";

import { useMemo } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import type { PlaceDetails } from "@/lib/api/places";
import type { Country } from "@/app/geo/apis";
import type { ContactFormState } from "./contact-details-schema";

/** The Contact card's edit mode — contact fields then the address block. State lives in the card. */
export function ContactDetailsForm({
  form, setForm, errors, countries, saving, onSave,
}: Readonly<{
  form: ContactFormState;
  setForm: (updater: (f: ContactFormState) => ContactFormState) => void;
  errors: Record<string, string>;
  countries: Country[];
  saving: boolean;
  onSave: () => void;
}>) {
  const countryOptions = useMemo(() => countries.map((c) => ({ value: String(c.id), label: c.name })), [countries]);
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );
  const countryIso2 = countries.find((c) => String(c.id) === form.countryId)?.iso2;

  // Picking a suggestion fills in what Google resolved, so the owner isn't retyping the city and
  // state it already knows — and it's what puts coordinates on the row for the map.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Email</Label>
        <Input
          className="h-10"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          aria-invalid={!!errors.email}
        />
        <FieldError message={errors.email} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Phone</Label>
        <div className="grid grid-cols-3 gap-2">
          <Combobox
            value={form.phoneCountryId}
            onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
            options={phoneCountryOptions}
            placeholder="Code"
            searchPlaceholder="Search countries..."
            aria-invalid={!!errors.phoneCountryId}
          />
          <Input
            className="col-span-2 h-10"
            value={form.phoneNumber}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
            aria-invalid={!!errors.phoneNumber}
            placeholder="984 1234567"
          />
        </div>
        <FieldError message={errors.phoneCountryId ?? errors.phoneNumber} />
      </div>

      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-3">
        <Label>Address</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-normal text-muted-foreground">Country</Label>
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
            <Label className="text-xs font-normal text-muted-foreground">Address</Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              onResolved={handlePlaceResolved}
              countryIso2={countryIso2}
            />
            <FieldError message={errors.address} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-normal text-muted-foreground">City</Label>
            <Input
              className="h-10"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              aria-invalid={!!errors.city}
            />
            <FieldError message={errors.city} />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-normal text-muted-foreground">State/Province</Label>
            <Input
              className="h-10"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              aria-invalid={!!errors.state}
            />
            <FieldError message={errors.state} />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-normal text-muted-foreground">Postcode</Label>
            <Input
              className="h-10"
              value={form.postcode}
              onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
              placeholder="Postcode"
            />
          </div>
        </div>
      </div>

      <Button className="h-10 w-full gap-1.5" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </Button>
    </div>
  );
}
