import { Users, Landmark, DollarSign, Languages, Maximize, MapPin } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { CountryDetail } from "../types";

export function CountryKeyFacts({ country }: Readonly<{ country: CountryDetail }>) {
  const facts = [
    country.population && { icon: Users, label: "Population", value: formatNumber(country.population) },
    country.capital && { icon: Landmark, label: "Capital", value: country.capital },
    country.currency && { icon: DollarSign, label: "Currency", value: country.currency },
    country.languages.length > 0 && { icon: Languages, label: "Language", value: country.languages.join(", ") },
    country.area_km2 && { icon: Maximize, label: "Area", value: `${formatNumber(country.area_km2)} km²` },
    country.visa_type && { icon: MapPin, label: "Visa", value: country.visa_type },
  ].filter((f): f is { icon: typeof Users; label: string; value: string } => !!f);

  if (facts.length === 0) return null;

  return (
    <section className="bg-primary py-5 text-primary-foreground sm:py-7">
      <div className="container mx-auto flex flex-wrap justify-center gap-3 px-4 sm:gap-4">
        {facts.map((f) => (
          <div
            key={f.label}
            className="flex w-30 flex-col items-center gap-2 rounded-xl bg-white/10 px-3 py-4 text-center backdrop-blur-sm transition-colors hover:bg-white/15 sm:w-36"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--gold))]/20">
              <f.icon className="h-4.5 w-4.5 text-[hsl(var(--gold))]" />
            </div>
            <p className="text-base leading-tight font-bold wrap-break-word sm:text-lg">{f.value}</p>
            <p className="text-xs tracking-wide text-primary-foreground/70 uppercase">{f.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
