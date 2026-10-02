"use client";

import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { PhoneInput } from "@/components/ui/phone-input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { cn } from "@/lib/utils";
import { BRANCH_TYPE_OPTIONS } from "../../const";
import type { BranchType } from "../../apis/types";

export type BranchForm = {
  name: string; countryId: string; city: string; address: string; state: string;
  email: string; phone: string;
  /** Create only. "same" sends no website, so the backend copies the parent's. */
  websiteMode: "same" | "own"; website: string;
};

export const EMPTY_BRANCH_FORM: BranchForm = {
  name: "", countryId: "", city: "", address: "", state: "",
  email: "", phone: "", websiteMode: "same", website: "",
};

/** "example.edu" → "https://example.edu", so a bare domain passes the backend's URL check. */
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** The create payload's website: undefined = same as parent, null = none, else the branch's own. */
export function branchWebsite(form: BranchForm): string | null | undefined {
  if (form.websiteMode === "same") return undefined;
  const url = form.website.trim();
  return url ? withScheme(url) : null;
}

/** Hostname without "www." — "https://ku.edu.np/" and "ku.edu.np" are the same site. */
const siteHost = (url: string | null | undefined) => {
  if (!url?.trim()) return null;
  try {
    return new URL(withScheme(url.trim())).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
};

/** Edit prefill: "same" (the default) unless the branch has a website of its own on another site. */
export function websiteFields(branchWebsite: string | null | undefined, parentWebsite: string | null | undefined) {
  const own = siteHost(branchWebsite);
  const same = own == null || own === siteHost(parentWebsite);
  return { websiteMode: same ? "same" : "own", website: same ? "" : branchWebsite ?? "" } as const;
}

/** Edit payload: "same" saves the parent's current website explicitly (a patch has no "copy" default). */
export function branchWebsitePatch(form: BranchForm, parentWebsite: string | null | undefined) {
  const website = branchWebsite(form);
  return website === undefined ? parentWebsite ?? null : website;
}

export function branchWebsiteError(form: BranchForm): string | undefined {
  const url = branchWebsite(form);
  if (!url) return undefined;
  try {
    new URL(url);
    return undefined;
  } catch {
    return "Enter a valid website URL";
  }
}

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
  showWebsite = false,
  countryIso2,
}: Readonly<{
  form: BranchForm;
  onChange: <K extends keyof BranchForm>(key: K, value: BranchForm[K]) => void;
  errors: Record<string, string | undefined>;
  countryOptions: ComboboxOption[];
  cityOptions: ComboboxOption[];
  citiesLoading: boolean;
  onCityChange: (cityName: string) => void;
  branchType: BranchType;
  onBranchTypeChange: (value: BranchType) => void;
  /** On create, and on edit of a branch this org created (the website is saved on that org). */
  showWebsite?: boolean;
  /** Biases address suggestions to the picked country. */
  countryIso2?: string | null;
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
        <Input className="h-10" value={form.state} onChange={(e) => onChange("state", e.target.value)} placeholder="State / Province" />
        {/* Same Places autocomplete as the other address forms — picking a suggestion fills
            State and, when it's in this country's list, City. */}
        <AddressAutocomplete
          value={form.address}
          onChange={(v) => onChange("address", v)}
          countryIso2={countryIso2}
          onResolved={(details) => {
            if (details.state) onChange("state", details.state);
            const city = details.city && cityOptions.find((o) => o.value.toLowerCase() === details.city!.toLowerCase());
            if (city) onCityChange(city.value);
          }}
        />
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

      {showWebsite && (
        <div className="flex flex-col gap-2">
          <Label>Does this branch use the same website as the parent?</Label>
          <div className="flex gap-2">
            {([["same", "Yes, same website"], ["own", "No, it has its own"]] as const).map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={form.websiteMode === mode ? "default" : "outline"}
                onClick={() => onChange("websiteMode", mode)}
              >
                {label}
              </Button>
            ))}
          </div>
          {form.websiteMode === "own" && (
            <>
              <Input
                className="h-10"
                aria-invalid={!!errors.website}
                value={form.website}
                onChange={(e) => onChange("website", e.target.value)}
                placeholder="https://branch.example.com"
              />
              <FieldError message={errors.website} />
            </>
          )}
        </div>
      )}

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
