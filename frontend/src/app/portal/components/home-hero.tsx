"use client";

import { useEffect, useState } from "react";
import { Cloud, Globe, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HERO_WIDGET_KEY, TIMEZONE_KEY } from "../const";
import { greeting } from "../utils";
import { usePersistedChoice } from "../utils/use-persisted-choice";
import { WeatherWidget } from "./weather-widget";
import { WorldClocks } from "./world-clocks";

type Widget = "weather" | "worldtime";

/** Intl provides the timezone list — no constants file, no date library. */
function allZones(): string[] {
  return typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];
}

const isWidget = (value: string): value is Widget => value === "weather" || value === "worldtime";
const isTimezone = (value: string): value is string => value.length > 0;

/**
 * Typography, sizes and the widget/toggle arrangement follow V1's PersonalHomeHero: p-6 rounded-xl shadow-lg,
 * a text-2xl font-semibold greeting, a text-sm subtitle, text-xs metadata, and the widget in a
 * md:min-w-[280px] lg:min-w-[380px] column beside a vertical toggle rail.
 *
 * The gradient is deliberately left as V3's own — everything else matches V1.
 */
export function HomeHero({ firstName, subtitle = "Your personal dashboard" }: { firstName: string | null; subtitle?: string }) {
  const [now, setNow] = useState(() => new Date());
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // `now` is real wall-clock time, so the server's render instant and the client's hydration instant are
  // never the same millisecond — and `firstName` can already be loaded client-side while a cached SSR pass
  // still has it null. Both are genuine hydration mismatches, so nothing derived from either renders until
  // mounted; a stable placeholder covers the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [timezonePopoverOpen, setTimezonePopoverOpen] = useState(false);
  const [zoneQuery, setZoneQuery] = useState("");

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
  }).format(now);

  const zoneMatches = (() => {
    const term = zoneQuery.trim().toLowerCase();
    const zones = allZones();
    return (term ? zones.filter((z) => z.toLowerCase().replace(/_/g, " ").includes(term)) : zones).slice(0, 60);
  })();

  const toggles = [
    { key: "weather" as Widget, icon: Cloud, label: "Weather" },
    { key: "worldtime" as Widget, icon: Globe, label: "World time" },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl p-6 shadow-lg bg-gradient-to-br from-primary via-primary to-primary/70">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: greeting + date/time + timezone */}
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-semibold text-white drop-shadow-sm">
            {mounted ? greeting(now.getHours()) : "Hello"}
            {mounted && firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-sm text-white/90 font-medium mt-0.5">{subtitle}</p>
          <p className="text-xs text-white/60 mt-1">{mounted ? `${dateLabel} · ${timeLabel}` : " "}</p>

          <Popover open={timezonePopoverOpen} onOpenChange={setTimezonePopoverOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1 text-xs text-white/60 hover:text-white/90 mt-1 transition-colors"
                />
              }
            >
              <Globe className="h-3 w-3" />
              {timezone.replace(/_/g, " ")}
              <Pencil className="h-2.5 w-2.5 opacity-70" />
            </PopoverTrigger>
            {timezonePopoverOpen && (
              <PopoverContent align="start" className="w-[280px] p-0">
                <div className="border-b p-1">
                  <Input
                    autoFocus
                    value={zoneQuery}
                    onChange={(event) => setZoneQuery(event.target.value)}
                    placeholder="Search timezone…"
                    className="h-8 border-none shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-[250px] overflow-auto p-1">
                  {zoneMatches.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No timezone found.</p>
                  ) : (
                    zoneMatches.map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => {
                          chooseTimezone(zone);
                          setTimezonePopoverOpen(false);
                          setZoneQuery("");
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                          zone === timezone && "bg-muted",
                        )}
                      >
                        {zone.replace(/_/g, " ")}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            )}
          </Popover>
        </div>

        {/* Right: widget + vertical toggle rail */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex-1 md:min-w-[280px] lg:min-w-[380px]">
            {widget === "weather" ? (
              // A failure flips to world clocks without surfacing an error; re-selecting weather retries.
              <WeatherWidget
                key={weatherUnavailable ? "retry" : "initial"}
                onUnavailable={() => setWeatherUnavailable(true)}
              />
            ) : (
              <WorldClocks now={now} homeTimezone={timezone} />
            )}
          </div>

          <div className="flex flex-col gap-1 bg-white/10 rounded-xl p-1">
            {toggles.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                title={option.label}
                onClick={() => selectWidget(option.key)}
                className={cn(
                  "cursor-pointer p-2 rounded-lg transition-all",
                  widget === option.key ? "bg-white/25 shadow-sm" : "hover:bg-white/10",
                )}
              >
                <option.icon className="h-4 w-4 text-white" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
