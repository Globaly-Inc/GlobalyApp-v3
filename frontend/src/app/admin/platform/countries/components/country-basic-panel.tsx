"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CountryPanelProps } from "../types";

export function CountryBasicPanel({ country, onChange, errors }: CountryPanelProps) {
  return (
    <FormSection title="Basic details" description="Name, codes and how the country appears in lists." columns={3}>
        <FormField label="Country Name" htmlFor="country-name" required error={errors.name}>
          <Input className="h-10" id="country-name" value={country.name ?? ""} onChange={(e) => onChange({ name: e.target.value })} aria-invalid={!!errors.name} />
        </FormField>

        <FormField label="Slug" htmlFor="country-slug" required error={errors.slug}>
          <Input className="h-10" id="country-slug" value={country.slug ?? ""} onChange={(e) => onChange({ slug: e.target.value })} aria-invalid={!!errors.slug} />
        </FormField>

        <FormField label="Country Code (ISO2)" htmlFor="country-code" required error={errors.iso2}>
          <Input className="h-10" id="country-code" maxLength={2} value={country.iso2 ?? ""} onChange={(e) => onChange({ iso2: e.target.value.toUpperCase() })} aria-invalid={!!errors.iso2} />
        </FormField>

        <FormField label="ISO3 Code" htmlFor="country-iso3" required error={errors.iso3}>
          <Input className="h-10" id="country-iso3" maxLength={3} value={country.iso3 ?? ""} onChange={(e) => onChange({ iso3: e.target.value.toUpperCase() })} aria-invalid={!!errors.iso3} />
        </FormField>

        <FormField label="Flag Emoji" htmlFor="country-flag">
          <Input className="h-10" id="country-flag" value={country.flag_emoji ?? ""} onChange={(e) => onChange({ flag_emoji: e.target.value || null })} />
        </FormField>

        <FormField label="Continent" htmlFor="country-continent">
          <Input className="h-10" id="country-continent" value={country.region ?? ""} onChange={(e) => onChange({ region: e.target.value || null })} />
        </FormField>

        <FormField label="Phone Code" htmlFor="country-phone-code">
          <Input className="h-10" id="country-phone-code" value={country.phone_code ?? ""} onChange={(e) => onChange({ phone_code: e.target.value || null })} />
        </FormField>

        <FormField label="Currency Symbol" htmlFor="country-currency-symbol">
          <Input className="h-10" id="country-currency-symbol" value={country.currency_symbol ?? ""} onChange={(e) => onChange({ currency_symbol: e.target.value || null })} />
        </FormField>

        <FormField label="Sort Order" htmlFor="country-sort-order">
          <Input
            className="h-10"
            id="country-sort-order"
            type="number"
            value={country.sort_order ?? 0}
            onChange={(e) => onChange({ sort_order: Number(e.target.value) || 0 })}
          />
        </FormField>

        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!country.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
          <Label>Active</Label>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!country.is_featured} onCheckedChange={(v) => onChange({ is_featured: v })} />
          <Label>Featured</Label>
        </div>
    </FormSection>
  );
}
