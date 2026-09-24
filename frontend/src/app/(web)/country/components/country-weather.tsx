import { icons } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Reveal } from "../../components/reveal";
import type { CountryDetail } from "../types";

// The column holds either an emoji ("☀️", seeded data — what v1 rendered) or a lucide name (what
// the admin IconPicker writes). Anything that isn't a known icon name is shown as the glyph it is;
// DynamicIcon alone turned every emoji into the same CloudSun fallback.
function SeasonIcon({ icon }: Readonly<{ icon: string | null }>) {
  if (icon && !(icon in icons)) return <span className="text-4xl leading-none">{icon}</span>;
  return <DynamicIcon name={icon} fallback="CloudSun" className="mx-auto h-9 w-9 text-primary" />;
}

export function CountryWeather({ country }: Readonly<{ country: CountryDetail }>) {
  const seasons = [country.weather_summer, country.weather_autumn, country.weather_winter, country.weather_spring].filter(
    (s): s is NonNullable<typeof s> => !!s,
  );
  if (seasons.length === 0) return null;

  return (
    <Reveal>
      <h2 className="mb-6 text-2xl font-bold">Weather &amp; Climate</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {seasons.map((season, i) => (
          <Card key={i} className="text-center transition-shadow hover:shadow-md">
            <CardContent className="pt-6 pb-4">
              <SeasonIcon icon={season.icon} />
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
