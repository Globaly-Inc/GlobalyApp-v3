"use client";

import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { BRANCH_TYPES } from "../../const";
import type { BranchType } from "../../apis/types";

export type BranchForm = {
  name: string; countryId: string; city: string; address: string; state: string; postcode: string;
  email: string; phoneCountryId: string; phoneNumber: string; website: string;
};

export const EMPTY_BRANCH_FORM: BranchForm = {
  name: "", countryId: "", city: "", address: "", state: "", postcode: "",
  email: "", phoneCountryId: "", phoneNumber: "", website: "",
};

export function CreateBranchDetailsStep({
  form,
  onChange,
  errors,
  countryOptions,
  cityOptions,
  citiesLoading,
  onCityChange,
  phoneCountryOptions,
  branchType,
  onBranchTypeChange,
}: Readonly<{
  form: BranchForm;
  onChange: <K extends keyof BranchForm>(key: K, value: string) => void;
  errors: Record<string, string | undefined>;
  countryOptions: ComboboxOption[];
  cityOptions: ComboboxOption[];
  citiesLoading: boolean;
  onCityChange: (cityName: string) => void;
  phoneCountryOptions: ComboboxOption[];
  branchType: BranchType;
  onBranchTypeChange: (value: BranchType) => void;
}>) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>
          Branch name <span className="text-destructive">*</span>
        </Label>
        <Input className="h-10" aria-invalid={!!errors.name} value={form.name} onChange={(e) => onChange("name", e.target.value)} placeholder="e.g. Sydney campus" />
        <FieldError message={errors.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          Address <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-[130px_1fr] gap-3">
          <Combobox
            value={form.countryId}
            onChange={(v) => {
              onChange("countryId", v);
              onChange("city", "");
            }}
            options={countryOptions}
            placeholder="Country"
            searchPlaceholder="Search countries..."
            aria-invalid={!!errors.countryId}
          />
          <Combobox
            value={form.city}
            onChange={onCityChange}
            options={cityOptions}
            placeholder={form.countryId ? "Select a city" : "Select a country first"}
            searchPlaceholder="Search cities..."
            loading={citiesLoading}
            disabled={!form.countryId}
          />
        </div>
        <FieldError message={errors.countryId} />
        <div className="grid grid-cols-2 gap-3">
          <Input className="h-10" value={form.state} onChange={(e) => onChange("state", e.target.value)} placeholder="State / Province" />
          <Input className="h-10" value={form.postcode} onChange={(e) => onChange("postcode", e.target.value)} placeholder="Postcode" />
        </div>
        <Input className="h-10" value={form.address} onChange={(e) => onChange("address", e.target.value)} placeholder="Street address" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Email</Label>
        <Input
          className="h-10"
          type="email"
          aria-invalid={!!errors.email}
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="branch@example.com"
        />
        <FieldError message={errors.email} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Phone</Label>
        <div className="grid grid-cols-[130px_1fr] gap-3">
          <Combobox
            value={form.phoneCountryId}
            onChange={(v) => onChange("phoneCountryId", v)}
            options={phoneCountryOptions}
            placeholder="Code"
            searchPlaceholder="Search countries..."
          />
          <Input className="h-10" value={form.phoneNumber} onChange={(e) => onChange("phoneNumber", e.target.value)} placeholder="(201) 555-0123" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Website</Label>
        <Input className="h-10" aria-invalid={!!errors.website} value={form.website} onChange={(e) => onChange("website", e.target.value)} placeholder="https://branch.example.com" />
        <FieldError message={errors.website} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          Branch type <span className="text-destructive">*</span>
        </Label>
        <Combobox
          value={branchType}
          onChange={(v) => onBranchTypeChange(v as BranchType)}
          options={BRANCH_TYPES}
          placeholder="Select branch type"
        />
      </div>
    </>
  );
}
