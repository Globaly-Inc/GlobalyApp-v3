import { Card, CardContent } from "@/components/ui/card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Reveal } from "../../components/reveal";
import type { CountryDetail } from "../types";

export function CountryWeather({ country }: Readonly<{ country: CountryDetail }>) {
  const seasons = [country.weather_summer, country.weather_autumn, country.weather_winter, country.weather_spring].filter(
    (s): s is NonNullable<typeof s> => !!s,
  );
  if (seasons.length === 0) return null;

  return (
    <Reveal>
      <h2 className="mb-6 text-2xl font-bold">Weather &amp; Climate</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {seasons.map((season, i) => (
          <Card key={i} className="transition-shadow hover:shadow-md">
            <CardContent className="pt-6 pb-4 text-center">
              <DynamicIcon name={season.icon} fallback="CloudSun" className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-3 font-semibold">{season.label}</p>
              {season.temp_range && <p className="mt-1 text-sm font-medium text-primary">{season.temp_range}</p>}
              {season.description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{season.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </Reveal>
  );
}
