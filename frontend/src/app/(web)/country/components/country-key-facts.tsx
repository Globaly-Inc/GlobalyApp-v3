import { Users, Landmark, DollarSign, Languages, Maximize, MapPin } from "lucide-react";
import type { CountryDetail } from "../types";

// Compact, not grouped: a fact column is ~1/6 of the container, so "26,900,000" wraps where "26.9M" fits.
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);

export function CountryKeyFacts({ country }: Readonly<{ country: CountryDetail }>) {
  const facts = [
    country.population && { icon: Users, label: "Population", value: compact(country.population) },
    country.capital && { icon: Landmark, label: "Capital", value: country.capital },
    country.currency && { icon: DollarSign, label: "Currency", value: country.currency },
    country.languages.length > 0 && { icon: Languages, label: "Language", value: country.languages.join(", ") },
    country.area_km2 && { icon: Maximize, label: "Area", value: `${compact(country.area_km2)} km²` },
    country.visa_type && { icon: MapPin, label: "Visa", value: country.visa_type },
  ].filter((f): f is { icon: typeof Users; label: string; value: string } => !!f);

  if (facts.length === 0) return null;

  return (
    <section className="bg-primary py-6 text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-3 lg:grid-cols-6">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1">
              <f.icon className="h-5 w-5 opacity-70" />
              <p className="text-lg leading-tight font-bold wrap-break-word">{f.value}</p>
              <p className="text-xs text-primary-foreground/70">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
