"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconPicker } from "@/components/icon-picker";
import type { Weather } from "../apis/types";
import type { CountryPanelProps } from "../types";

type Season = "weather_summer" | "weather_autumn" | "weather_winter" | "weather_spring";

const SEASONS: { key: Season; label: string }[] = [
  { key: "weather_summer", label: "Summer" },
  { key: "weather_autumn", label: "Autumn" },
  { key: "weather_winter", label: "Winter" },
  { key: "weather_spring", label: "Spring" },
];

function SeasonForm({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: Weather; onChange: (weather: Weather) => void }>) {
  const update = (updates: Partial<NonNullable<Weather>>) => onChange({ ...(value ?? { label: null, icon: null, description: null, temp_range: null }), ...updates });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Icon</Label>
          <IconPicker value={value?.icon ?? ""} onChange={(name) => update({ icon: name || null })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Temp range</Label>
          <Input className="h-10" value={value?.temp_range ?? ""} onChange={(e) => update({ temp_range: e.target.value || null })} placeholder="e.g. 18-30°C" />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Description</Label>
          <Input className="h-10" value={value?.description ?? ""} onChange={(e) => update({ description: e.target.value || null })} />
        </div>
      </CardContent>
    </Card>
  );
}

export function CountryWeatherPanel({ country, onChange }: CountryPanelProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SEASONS.map((season) => (
        <SeasonForm
          key={season.key}
          label={season.label}
          value={country[season.key] ?? null}
          onChange={(weather) => onChange({ [season.key]: weather })}
        />
      ))}
    </div>
  );
}
