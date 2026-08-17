"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function LocationCard({
  countryOptions,
  countryId,
  onCountryChange,
  address,
  onAddressChange,
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
  address: string;
  onAddressChange: (value: string) => void;
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
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">Location</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Country</Label>
          <Combobox
            options={countryOptions}
            value={countryId ? String(countryId) : ""}
            onChange={(v) => onCountryChange(v ? Number(v) : null)}
            placeholder="Select country"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Address</Label>
          <Input className="h-10" value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder="Street address" />
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
        <div className="flex flex-col gap-2">
          <Label>Website</Label>
          <Input className="h-10" aria-invalid={!!websiteError} value={website} onChange={(e) => onWebsiteChange(e.target.value)} placeholder="https://www.business.com" />
          <FieldError message={websiteError} />
        </div>
      </div>
    </Card>
  );
}
