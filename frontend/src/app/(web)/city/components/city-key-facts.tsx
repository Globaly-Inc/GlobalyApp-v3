import { Users, Maximize, Clock, Globe } from "lucide-react";
import type { CityDetail } from "../types";

export function CityKeyFacts({ city }: Readonly<{ city: CityDetail }>) {
  const facts = [
    city.population_label && { icon: Users, label: "Population", value: city.population_label },
    city.area_label && { icon: Maximize, label: "Area", value: city.area_label },
    city.timezone && { icon: Clock, label: "Timezone", value: city.timezone },
    city.weather_label && { icon: Globe, label: "Climate", value: city.weather_label },
  ].filter((f): f is { icon: typeof Users; label: string; value: string } => !!f);

  if (facts.length === 0) return null;

  return (
    <section className="bg-primary py-6 text-primary-foreground">
      <div className="container mx-auto grid grid-cols-2 gap-4 px-4 text-center md:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-1">
            <f.icon className="h-5 w-5 opacity-70" />
            <p className="text-lg leading-tight font-bold">{f.value}</p>
            <p className="text-xs text-primary-foreground/70">{f.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
