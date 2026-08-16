"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountryDetailsPanel({ country, onChange }: CountryPanelProps) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country-capital">Capital</Label>
          <Input className="h-10" id="country-capital" value={country.capital ?? ""} onChange={(e) => onChange({ capital: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-currency">Currency</Label>
          <Input className="h-10" id="country-currency" value={country.currency ?? ""} onChange={(e) => onChange({ currency: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-timezone">Timezone</Label>
          <Input className="h-10" id="country-timezone" value={country.timezone ?? ""} onChange={(e) => onChange({ timezone: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-population">Population</Label>
          <Input
            className="h-10"
            id="country-population"
            type="number"
            value={country.population ?? ""}
            onChange={(e) => onChange({ population: e.target.value ? Number(e.target.value) : null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="country-area">Area (km²)</Label>
          <Input
            className="h-10"
            id="country-area"
            type="number"
            value={country.area_km2 ?? ""}
            onChange={(e) => onChange({ area_km2: e.target.value ? Number(e.target.value) : null })}
          />
        </div>

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
      </CardContent>
    </Card>
  );
}
