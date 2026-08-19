"use client";

import { useEffect, useState } from "react";
import { Cloud, Globe, MapPin } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { HERO_WIDGET_KEY, TIMEZONE_KEY } from "../const";
import { greeting } from "../utils";
import { usePersistedChoice } from "../utils/use-persisted-choice";
import { WeatherWidget } from "./weather-widget";
import { WorldClocks } from "./world-clocks";

type Widget = "weather" | "worldtime";

/** Intl provides the timezone list — no constants file, no date library. */
function timezoneOptions() {
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [Intl.DateTimeFormat().resolvedOptions().timeZone];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
}

const isWidget = (value: string): value is Widget => value === "weather" || value === "worldtime";
const isTimezone = (value: string): value is string => value.length > 0;

export function HomeHero({ firstName }: { firstName: string | null }) {
  const [now, setNow] = useState(() => new Date());
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // `now` is real wall-clock time, so the server's render instant and the client's hydration instant
  // are never the same millisecond — and `firstName` can already be loaded client-side (from an earlier
  // navigation) while a fresh/cached SSR pass still has it null. Both cause a genuine hydration mismatch,
  // so nothing derived from either renders until mounted; a stable placeholder covers the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Both preferences survive a reload, and neither is read in an effect — see usePersistedChoice.
  const [storedWidget, chooseWidget] = usePersistedChoice<Widget>(HERO_WIDGET_KEY, "weather", isWidget);
  const [timezone, chooseTimezone] = usePersistedChoice<string>(TIMEZONE_KEY, browserZone, isTimezone);

  // Weather can turn itself off for this session (denied permission, fetch failure) without overwriting the
  // user's saved preference — the hero shows clocks rather than an empty frame.
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const widget: Widget = storedWidget === "weather" && weatherUnavailable ? "worldtime" : storedWidget;

  // Picking a widget must always do something. Without clearing the flag, one failed weather load pinned the
  // hero to clocks for the rest of the session and the cloud button silently did nothing when clicked.
  const selectWidget = (next: Widget) => {
    if (next === "weather") setWeatherUnavailable(false);
    chooseWidget(next);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);

  return (
    <section className="rounded-xl bg-gradient-to-br from-primary via-primary to-primary/70 px-4 py-5 md:px-6 md:py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold text-primary-foreground md:text-2xl">
            {mounted ? greeting(now.getHours()) : "Hello"}
            {mounted && firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-sm text-primary-foreground/80">Your personal dashboard</p>
          <p className="text-sm font-medium text-primary-foreground">
            {mounted ? `${dateLabel} · ${timeLabel}` : " "}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5">
            <MapPin className="h-3.5 w-3.5 text-primary-foreground/70" />
            <Combobox
              options={timezoneOptions()}
              value={timezone}
              onChange={chooseTimezone}
              placeholder="Select timezone"
              searchPlaceholder="Search timezones…"
              className="h-7 w-56 border-white/20 bg-white/10 text-xs text-primary-foreground"
            />
          </div>
        </div>

        <div className="w-full space-y-2 md:max-w-sm">
          <div className="flex justify-end gap-1">
            {(
              [
                { key: "weather" as Widget, icon: Cloud, label: "Weather" },
                { key: "worldtime" as Widget, icon: Globe, label: "World clocks" },
              ]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                onClick={() => selectWidget(option.key)}
                className={cn(
                  "cursor-pointer rounded-md p-1.5 transition-colors",
                  widget === option.key ? "bg-white/25 text-white" : "text-white/60 hover:bg-white/10",
                )}
              >
                <option.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {widget === "weather" ? (
            // A failure flips to world clocks without surfacing an error; re-selecting weather retries.
            <WeatherWidget key={weatherUnavailable ? "retry" : "initial"} onUnavailable={() => setWeatherUnavailable(true)} />
          ) : (
            <WorldClocks now={now} homeTimezone={timezone} />
          )}
        </div>
      </div>
    </section>
  );
}
