"use client";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { AddressAutocomplete } from "./address-autocomplete";
import type { PlaceDetails } from "../../apis/types";

export function LocationCard({
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
  website,
  onWebsiteChange,
  websiteError,
}: Readonly<{
  countryOptions: ComboboxOption[];
  countryId: number | null | undefined;
  onCountryChange: (id: number | null) => void;
  countryIso2?: string | null;
  address: string;
  onAddressChange: (value: string) => void;
  onPlaceResolved: (details: PlaceDetails) => void;
  city: string;
  onCityChange: (value: string) => void;
  state: string;
  onStateChange: (value: string) => void;
  postcode: string;
  onPostcodeChange: (value: string) => void;
  website: string;
  onWebsiteChange: (value: string) => void;
  websiteError?: string;
}>) {
  return (
    <FormSection title="Location" columns={2}>
      <FormField label="Country" htmlFor="business-country">
        <Combobox
          id="business-country"
          options={countryOptions}
          value={countryId ? String(countryId) : ""}
          onChange={(v) => onCountryChange(v ? Number(v) : null)}
          placeholder="Select country"
          contentClassName="w-72"
        />
      </FormField>
      <FormField label="Address">
        <AddressAutocomplete value={address} onChange={onAddressChange} onResolved={onPlaceResolved} countryIso2={countryIso2} />
      </FormField>
      <FormField label="City" htmlFor="business-city">
        <Input id="business-city" className="h-10" value={city} onChange={(e) => onCityChange(e.target.value)} placeholder="City" />
      </FormField>
      <FormField label="State/Province" htmlFor="business-state">
        <Input id="business-state" className="h-10" value={state} onChange={(e) => onStateChange(e.target.value)} placeholder="State/Province" />
      </FormField>
      <FormField label="Postcode" htmlFor="business-postcode">
        <Input id="business-postcode" className="h-10" value={postcode} onChange={(e) => onPostcodeChange(e.target.value)} placeholder="Postcode" />
      </FormField>
      <FormField label="Website" htmlFor="business-website" error={websiteError}>
        <Input id="business-website" className="h-10" aria-invalid={!!websiteError} value={website} onChange={(e) => onWebsiteChange(e.target.value)} placeholder="https://www.business.com" />
      </FormField>
    </FormSection>
  );
}
