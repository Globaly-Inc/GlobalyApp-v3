import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { CourseWeather } from "../../../search/types";

// Southern-hemisphere month spans, exactly as V1 labelled them.
const SEASONS = [
  { key: "summer", label: "Summer", months: "Dec – Feb", emoji: "☀️" },
  { key: "autumn", label: "Autumn", months: "Mar – May", emoji: "🍂" },
  { key: "winter", label: "Winter", months: "Jun – Aug", emoji: "❄️" },
  { key: "spring", label: "Spring", months: "Sep – Nov", emoji: "🌸" },
] as const;

export function CourseWeatherCard({
  weather, countryName,
}: Readonly<{ weather: CourseWeather | null; countryName: string | null }>) {
  if (!weather) return null;
  const seasons = SEASONS.filter((s) => weather[s.key]);
  if (seasons.length === 0) return null;

  return (
    <ProfileSection icon={Clock} title="Weather Information">
      {countryName && <Badge variant="secondary" className="mb-3 text-xs">{countryName}</Badge>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {seasons.map(({ key, label, months, emoji }) => {
          const season = weather[key];
          return (
            <div key={key} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg">
                {emoji}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{months}</p>
                {season?.temp_range && <p className="mt-0.5 text-xs font-medium text-primary">{season.temp_range}</p>}
                {season?.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{season.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </ProfileSection>
  );
}
