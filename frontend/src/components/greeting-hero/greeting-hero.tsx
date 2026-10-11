"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cloud, Globe } from "lucide-react";
import { HeroCard } from "@/components/ui/hero-card";
import { cn } from "@/lib/utils";
import { TimezonePicker } from "./timezone-picker";
import { usePersistedChoice } from "./use-persisted-choice";
import { greeting, heroStorageKeys } from "./utils";
import { WeatherWidget } from "./weather-widget";
import { WorldClocks } from "./world-clocks";

type Widget = "weather" | "worldtime";

const WIDGETS = [
  { key: "weather" as Widget, icon: Cloud, label: "Weather" },
  { key: "worldtime" as Widget, icon: Globe, label: "World clocks" },
];

const noopSubscribe = () => () => {};
const isWidget = (value: string): value is Widget => value === "weather" || value === "worldtime";
const isTimezone = (value: string): value is string => value.length > 0;

/**
 * The personal and business portal greeting: time-of-day hello, live clock in a chosen zone, and a weather /
 * world-clocks widget. `storagePrefix` keeps each portal's choices apart ("personal", "business").
 */
export function GreetingHero({
  name,
  subtitle,
  storagePrefix,
}: Readonly<{ name?: string | null; subtitle: string; storagePrefix: string }>) {
  const keys = heroStorageKeys(storagePrefix);
  const [now, setNow] = useState(() => new Date());
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // `now` is wall-clock time and `name` may already be loaded client-side while SSR had it null — both would
  // mismatch on hydration, so nothing derived from either renders until mounted.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Both preferences survive a reload, and neither is read in an effect — see usePersistedChoice.
  const [widget, selectWidget] = usePersistedChoice<Widget>(keys.widget, "weather", isWidget);
  const [timezone, chooseTimezone] = usePersistedChoice<string>(keys.timezone, browserZone, isTimezone);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone, weekday: "long", day: "2-digit", month: "short", year: "numeric",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone, hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(now);

  return (
    <HeroCard
      title={<>{mounted ? greeting(now.getHours()) : "Hello"}{mounted && name ? `, ${name}` : ""} 👋</>}
      subtitle={
        <>
          <span className="block">{subtitle}</span>
          <span className="mt-1 block font-medium text-white">{mounted ? `${dateLabel} · ${timeLabel}` : " "}</span>
          <TimezonePicker timezone={timezone} onChange={chooseTimezone} />
        </>
      }
      aside={
        <div className="flex w-full flex-col gap-2 sm:w-sm">
          <div className="flex justify-end gap-1">
            {WIDGETS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                aria-pressed={widget === option.key}
                onClick={() => selectWidget(option.key)}
                className={cn(
                  "cursor-pointer rounded-md p-1.5 transition-colors",
                  widget === option.key ? "bg-white/25 text-white" : "text-white/70 hover:bg-white/10",
                )}
              >
                <option.icon className="size-3.5" />
              </button>
            ))}
          </div>
          {widget === "weather" ? <WeatherWidget /> : <WorldClocks now={now} homeTimezone={timezone} storageKey={keys.worldClocks} />}
        </div>
      }
    />
  );
}
