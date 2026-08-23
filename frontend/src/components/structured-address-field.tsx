"use client";

// Country + autocompleted street address + City/State/Postcode, wired so picking an address
// suggestion backfills the other fields from its place details. Generalized from the pattern
// already used in the admin add-business flow (`add-business/location-card.tsx`), now built on
// the shared `AddressAutocomplete` (server-proxied Places, no client-exposed key) so any profile
// form can reuse it instead of re-building the same four fields.

import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import type { PlaceDetails } from "@/lib/api/places";

export function StructuredAddressField({
  countryOptions,
  countryId,
  onCountryChange,
  countryIso2,
  address,
  onAddressChange,
  onPlaceResolved,
  city,
  onCityChange,
  state,
  onStateChange,
  postcode,
  onPostcodeChange,
}: Readonly<{
  countryOptions: ComboboxOption[];
  countryId: string;
  onCountryChange: (id: string) => void;
  countryIso2?: string | null;
  address: string;
  onAddressChange: (value: string) => void;
  onPlaceResolved?: (details: PlaceDetails) => void;
  city: string;
  onCityChange: (value: string) => void;
  state: string;
  onStateChange: (value: string) => void;
  postcode: string;
  onPostcodeChange: (value: string) => void;
}>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label>Country</Label>
        <Combobox options={countryOptions} value={countryId} onChange={onCountryChange} placeholder="Select country" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Address</Label>
        <AddressAutocomplete
          value={address}
          onChange={onAddressChange}
          onResolved={(details) => {
            if (details.city) onCityChange(details.city);
            if (details.state) onStateChange(details.state);
            if (details.postcode) onPostcodeChange(details.postcode);
            onPlaceResolved?.(details);
          }}
          countryIso2={countryIso2}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>City</Label>
        <Input className="h-10" value={city} onChange={(e) => onCityChange(e.target.value)} placeholder="City" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>State/Province</Label>
        <Input className="h-10" value={state} onChange={(e) => onStateChange(e.target.value)} placeholder="State/Province" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Postcode</Label>
        <Input className="h-10" value={postcode} onChange={(e) => onPostcodeChange(e.target.value)} placeholder="Postcode" />
      </div>
    </div>
  );
}
