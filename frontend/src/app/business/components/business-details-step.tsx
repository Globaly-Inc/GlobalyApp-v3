"use client";

import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { BusinessType, SelectOption } from "../apis/types";

export function BusinessDetailsStep({
  businessType,
  businessName,
  onBusinessNameChange,
  subdomain,
  onSubdomainChange,
  phone,
  onPhoneChange,
  countryId,
  onCountryChange,
  countryOptions,
  address,
  onAddressChange,
  state,
  onStateChange,
  city,
  onCityChange,
  postcode,
  onPostcodeChange,
  companyRegistrationFile,
  onCompanyRegistrationFileChange,
  fieldErrors,
  saving,
  onBack,
  onSubmit,
}: Readonly<{
  businessType: BusinessType | null;
  businessName: string;
  onBusinessNameChange: (value: string) => void;
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  countryId: string;
  onCountryChange: (value: string) => void;
  countryOptions: SelectOption[];
  address: string;
  onAddressChange: (value: string) => void;
  state: string;
  onStateChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  postcode: string;
  onPostcodeChange: (value: string) => void;
  companyRegistrationFile: File | null;
  onCompanyRegistrationFileChange: (file: File | null) => void;
  fieldErrors: Record<string, string>;
  saving: boolean;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}>) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Business Details</h1>
        <p className="text-muted-foreground mt-1">Tell us about your organisation.</p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{businessType === "institution" ? "Institution Name *" : "Business Name"}</Label>
            <Input
              className="h-10"
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              placeholder={businessType === "institution" ? "e.g. Global State University" : "e.g. Global Education Agency"}
              aria-invalid={!!fieldErrors.businessName}
            />
            {fieldErrors.businessName && <p className="text-sm text-destructive">{fieldErrors.businessName}</p>}
          </div>
          {businessType !== "institution" && (
            <div className="space-y-2">
              <Label>Subdomain *</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-10"
                  value={subdomain}
                  onChange={(e) => onSubdomainChange(e.target.value.toLowerCase())}
                  placeholder="your-agency"
                  aria-invalid={!!fieldErrors.subdomain}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.globalyhub.com</span>
              </div>
              {fieldErrors.subdomain && <p className="text-sm text-destructive">{fieldErrors.subdomain}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                className="h-10"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                aria-invalid={!!fieldErrors.phone}
              />
              {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Country *</Label>
              <Combobox
                value={countryId}
                onChange={onCountryChange}
                placeholder="Select country"
                searchPlaceholder="Search countries..."
                options={countryOptions}
                aria-invalid={!!fieldErrors.countryId}
              />
              {fieldErrors.countryId && <p className="text-sm text-destructive">{fieldErrors.countryId}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address *</Label>
            <Input
              className="h-10"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              aria-invalid={!!fieldErrors.address}
            />
            {fieldErrors.address && <p className="text-sm text-destructive">{fieldErrors.address}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>State</Label>
              <Input className="h-10" value={state} onChange={(e) => onStateChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input className="h-10" value={city} onChange={(e) => onCityChange(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Postcode</Label>
            <Input className="h-10" value={postcode} onChange={(e) => onPostcodeChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Company Registration Document</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => onCompanyRegistrationFileChange(e.target.files?.[0] ?? null)}
            />
            {companyRegistrationFile && (
              <p className="text-sm text-muted-foreground">Selected: {companyRegistrationFile.name}</p>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="h-10 flex-1 cursor-pointer">
          Back
        </Button>
        <Button type="submit" disabled={saving} className="h-10 flex-1 cursor-pointer">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Finish
        </Button>
      </div>
    </form>
  );
}
