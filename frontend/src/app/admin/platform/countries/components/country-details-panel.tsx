"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountryDetailsPanel({ country, onChange }: CountryPanelProps) {
  return (
    <FormSection title="Country details" description="Facts shown on the country page." columns={3}>
        <FormField label="Capital" htmlFor="country-capital">
          <Input className="h-10" id="country-capital" value={country.capital ?? ""} onChange={(e) => onChange({ capital: e.target.value || null })} />
        </FormField>

        <FormField label="Currency" htmlFor="country-currency">
          <Input className="h-10" id="country-currency" value={country.currency ?? ""} onChange={(e) => onChange({ currency: e.target.value || null })} />
        </FormField>

        <FormField label="Timezone" htmlFor="country-timezone">
          <Input className="h-10" id="country-timezone" value={country.timezone ?? ""} onChange={(e) => onChange({ timezone: e.target.value || null })} />
        </FormField>

        <FormField label="Population" htmlFor="country-population">
          <Input
            className="h-10"
            id="country-population"
            type="number"
            value={country.population ?? ""}
            onChange={(e) => onChange({ population: e.target.value ? Number(e.target.value) : null })}
          />
        </FormField>

        <FormField label="Area (km²)" htmlFor="country-area">
          <Input
            className="h-10"
            id="country-area"
            type="number"
            value={country.area_km2 ?? ""}
            onChange={(e) => onChange({ area_km2: e.target.value ? Number(e.target.value) : null })}
          />
        </FormField>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="country-languages">Languages (comma-separated)</Label>
          <Input
            className="h-10"
            id="country-languages"
            value={(country.languages ?? []).join(", ")}
            onChange={(e) => onChange({ languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="country-about">About</Label>
          <Textarea className="min-h-20" id="country-about" rows={4} value={country.about ?? ""} onChange={(e) => onChange({ about: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="country-why-study">Why study here</Label>
          <Textarea
            className="min-h-20"
            id="country-why-study"
            rows={4}
            value={country.why_study_here ?? ""}
            onChange={(e) => onChange({ why_study_here: e.target.value || null })}
          />
        </div>
    </FormSection>
  );
}
