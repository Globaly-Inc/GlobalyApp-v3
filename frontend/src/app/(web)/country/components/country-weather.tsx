import { Card, CardContent } from "@/components/ui/card";
import type { CountryDetail } from "../types";

export function CountryWeather({ country }: Readonly<{ country: CountryDetail }>) {
  const seasons = [country.weather_summer, country.weather_autumn, country.weather_winter, country.weather_spring].filter(
    (s): s is NonNullable<typeof s> => !!s,
  );
  if (seasons.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Weather &amp; Climate</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {seasons.map((season, i) => (
          <Card key={i}>
            <CardContent className="pt-6 pb-4 text-center">
              <p className="text-4xl">{season.icon ?? "🌤️"}</p>
              <p className="mt-3 font-semibold">{season.label}</p>
              {season.temp_range && <p className="mt-1 text-sm font-medium text-primary">{season.temp_range}</p>}
              {season.description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{season.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
