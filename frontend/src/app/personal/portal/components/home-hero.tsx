"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, Globe, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [widget, selectWidget] = usePersistedChoice<Widget>(HERO_WIDGET_KEY, "weather", isWidget);
  const [timezone, chooseTimezone] = usePersistedChoice<string>(TIMEZONE_KEY, browserZone, isTimezone);

  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [timezoneQuery, setTimezoneQuery] = useState("");
  const filteredTimezones = useMemo(() => {
    const term = timezoneQuery.trim().toLowerCase();
    const zones = timezoneOptions();
    return term ? zones.filter((z) => z.label.toLowerCase().includes(term)) : zones;
  }, [timezoneQuery]);

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
          <Popover
            open={timezoneOpen}
            onOpenChange={(next) => {
              setTimezoneOpen(next);
              if (next) setTimezoneQuery("");
            }}
          >
            <PopoverTrigger className="flex items-center gap-1 text-xs text-white/60 hover:text-white/90 mt-1 transition-colors">
              <Globe className="h-3 w-3" />
              {timezone.replace(/_/g, " ")}
              <Pencil className="h-2.5 w-2.5 opacity-70" />
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <div className="relative border-b p-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                <Input
                  autoFocus
                  value={timezoneQuery}
                  onChange={(event) => setTimezoneQuery(event.target.value)}
                  placeholder="Search timezone…"
                  className="h-8 border-none pl-8 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-[250px] overflow-y-auto p-1">
                {filteredTimezones.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No timezone found.</p>
                ) : (
                  filteredTimezones.map((tz) => (
                    <button
                      key={tz.value}
                      type="button"
                      onClick={() => {
                        chooseTimezone(tz.value);
                        setTimezoneOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {tz.label}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
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

          {widget === "weather" ? <WeatherWidget /> : <WorldClocks now={now} homeTimezone={timezone} />}
        </div>
      </div>
    </section>
  );
}
