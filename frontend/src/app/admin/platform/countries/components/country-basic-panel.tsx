"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/field-error";
import type { CountryPanelProps } from "../types";

export function CountryBasicPanel({ country, onChange, errors }: CountryPanelProps) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country-name">Country Name *</Label>
          <Input className="h-10" id="country-name" value={country.name ?? ""} onChange={(e) => onChange({ name: e.target.value })} aria-invalid={!!errors.name} />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-slug">Slug *</Label>
          <Input className="h-10" id="country-slug" value={country.slug ?? ""} onChange={(e) => onChange({ slug: e.target.value })} aria-invalid={!!errors.slug} />
          <FieldError message={errors.slug} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-code">Country Code (ISO2) *</Label>
          <Input className="h-10" id="country-code" maxLength={2} value={country.iso2 ?? ""} onChange={(e) => onChange({ iso2: e.target.value.toUpperCase() })} aria-invalid={!!errors.iso2} />
          <FieldError message={errors.iso2} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-iso3">ISO3 Code *</Label>
          <Input className="h-10" id="country-iso3" maxLength={3} value={country.iso3 ?? ""} onChange={(e) => onChange({ iso3: e.target.value.toUpperCase() })} aria-invalid={!!errors.iso3} />
          <FieldError message={errors.iso3} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-flag">Flag Emoji</Label>
          <Input className="h-10" id="country-flag" value={country.flag_emoji ?? ""} onChange={(e) => onChange({ flag_emoji: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-continent">Continent</Label>
          <Input className="h-10" id="country-continent" value={country.region ?? ""} onChange={(e) => onChange({ region: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-phone-code">Phone Code</Label>
          <Input className="h-10" id="country-phone-code" value={country.phone_code ?? ""} onChange={(e) => onChange({ phone_code: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-currency-symbol">Currency Symbol</Label>
          <Input className="h-10" id="country-currency-symbol" value={country.currency_symbol ?? ""} onChange={(e) => onChange({ currency_symbol: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-sort-order">Sort Order</Label>
          <Input
            className="h-10"
            id="country-sort-order"
            type="number"
            value={country.sort_order ?? 0}
            onChange={(e) => onChange({ sort_order: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!country.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
          <Label>Active</Label>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!country.is_featured} onCheckedChange={(v) => onChange({ is_featured: v })} />
          <Label>Featured</Label>
        </div>
      </CardContent>
    </Card>
  );
}
