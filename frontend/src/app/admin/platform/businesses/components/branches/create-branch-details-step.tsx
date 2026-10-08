"use client";

import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Building, Check, GitBranch, Mail, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { PhoneInput } from "@/components/ui/phone-input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import { FormSection } from "./form-section";
import { BranchTypeCards } from "./branch-type-cards";
import { HowBranchesWork } from "./how-branches-work";
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

/** Soft filled input that glows in the brand colour on focus. */
const FIELD = "h-10 border-transparent bg-muted/60 transition-[background-color,border-color,box-shadow] hover:border-border focus-visible:border-primary focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/15";

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
  showHowItWorks = true,
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
  /** The branch page shows this note in its side column instead. */
  showHowItWorks?: boolean;
  /** Biases address suggestions to the picked country. */
  countryIso2?: string | null;
}>) {
  const nameValid = form.name.trim().length >= 2;
  return (
    <>
      <FormSection icon={Building} title="Identity" hint="The name people see in search and on your profile.">
        <div className="flex flex-col gap-2">
          <Label>
            Branch name <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input className={cn(FIELD, "pr-9")} aria-invalid={!!errors.name} value={form.name} onChange={(e) => onChange("name", e.target.value)} placeholder="e.g. Sydney campus" />
            <Check
              aria-hidden
              className={cn(
                "absolute right-3 top-1/2 size-4 -translate-y-1/2 text-emerald-600 transition-[opacity,transform] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] dark:text-emerald-400",
                nameValid ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
            />
          </div>
          <FieldError message={errors.name} />
        </div>
      </FormSection>

      <FormSection icon={MapPin} title="Location" hint="Pick a country first, then the city." required>
        <div className="flex flex-col gap-2">
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
          <Input className={FIELD} value={form.state} onChange={(e) => onChange("state", e.target.value)} placeholder="State / Province" />
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
      </FormSection>

      <FormSection icon={Mail} title="Contact" hint="Optional. Students reach this branch directly.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label>Email</Label>
            <Input
              className={FIELD}
              type="email"
              aria-invalid={!!errors.email}
              value={form.email}
              onChange={(e) => onChange("email", e.target.value)}
              placeholder="branch@example.com"
            />
            <FieldError message={errors.email} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label>Phone</Label>
            <PhoneInput value={form.phone} onChange={(v) => onChange("phone", v)} placeholder="(201) 555-0123" />
          </div>
        </div>

        {showWebsite && (
          <div className="flex flex-col gap-2">
            <Label>Does this branch use the same website as the parent?</Label>
            <div role="group" className="relative grid w-fit grid-cols-2 rounded-lg bg-muted/60 p-[3px]">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-md bg-primary shadow-sm transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]",
                  form.websiteMode === "own" && "translate-x-full",
                )}
              />
              {([["same", "Yes, same website"], ["own", "No, it has its own"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={form.websiteMode === mode}
                  onClick={() => onChange("websiteMode", mode)}
                  className="relative z-10 whitespace-nowrap rounded-md px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors aria-pressed:text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {label}
                </button>
              ))}
            </div>
            <Reveal open={form.websiteMode === "own"} className="flex flex-col gap-2 p-0.5">
              <Input
                className={FIELD}
                aria-invalid={!!errors.website}
                value={form.website}
                onChange={(e) => onChange("website", e.target.value)}
                placeholder="https://branch.example.com"
              />
              <FieldError message={errors.website} />
            </Reveal>
          </div>
        )}
      </FormSection>

      {showHowItWorks && <HowBranchesWork />}

      <FormSection icon={GitBranch} title="Branch type" hint="How this branch relates to your registered company." required>
        <BranchTypeCards value={branchType} onChange={onBranchTypeChange} />
      </FormSection>
    </>
  );
}
