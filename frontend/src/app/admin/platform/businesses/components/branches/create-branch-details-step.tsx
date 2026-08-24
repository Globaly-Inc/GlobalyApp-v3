"use client";

import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import { BRANCH_TYPE_OPTIONS } from "../../const";
import type { BranchType } from "../../apis/types";

export type BranchForm = {
  name: string; countryId: string; city: string; address: string; state: string; postcode: string;
  email: string; phone: string; website: string;
};

export const EMPTY_BRANCH_FORM: BranchForm = {
  name: "", countryId: "", city: "", address: "", state: "", postcode: "",
  email: "", phone: "", website: "",
};

export function CreateBranchDetailsStep({
  form,
  onChange,
  errors,
  countryOptions,
  cityOptions,
  citiesLoading,
  onCityChange,
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
        <PhoneInput value={form.phone} onChange={(v) => onChange("phone", v)} placeholder="(201) 555-0123" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Website</Label>
        <Input className="h-10" aria-invalid={!!errors.website} value={form.website} onChange={(e) => onChange("website", e.target.value)} placeholder="https://branch.example.com" />
        <FieldError message={errors.website} />
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
        <p className="text-sm font-medium text-foreground">How branches work</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          A branch is a new office linked to your primary business. It shares your business category and can access
          shared services from other offices. Each branch operates as its own entity with separate contact details,
          media, and team.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>
          Branch type <span className="text-destructive">*</span>
        </Label>
        <div className="grid gap-2">
          {BRANCH_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onBranchTypeChange(opt.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                branchType === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                  branchType === opt.value ? "border-primary" : "border-muted-foreground/40",
                )}
              >
                {branchType === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
