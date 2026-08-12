"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudFog, CloudRain, CloudSnow, Droplets, Sun, Wind, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { weatherCondition } from "../utils";
import type { WeatherSnapshot } from "../types";

/**
 * Secondary by design. Open-Meteo and Nominatim are unauthenticated third parties, so nothing on Home
 * awaits this: on a denied permission or any failure it calls onUnavailable() and the hero shows world
 * clocks instead — no toast, no empty weather frame. Re-selecting the weather toggle retries.
 */

/**
 * WMO weather code → icon, as a component rather than a returned component reference: picking a component
 * inside render resets its state on every pass, which the lint rule rightly rejects.
 */
function WeatherIcon({ code, className }: { code: number; className?: string }) {
  if (code === 0 || code === 1) return <Sun className={className} />;
  if (code <= 3) return <Cloud className={className} />;
  if (code <= 49) return <CloudFog className={className} />;
  if (code <= 69) return <CloudRain className={className} />;
  if (code <= 79) return <CloudSnow className={className} />;
  if (code <= 84) return <CloudRain className={className} />;
  if (code <= 99) return <Zap className={className} />;
  return <Cloud className={className} />;
}

export function WeatherWidget({ onUnavailable }: { onUnavailable: () => void }) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onUnavailable();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
              "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
              "&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7",
          );
          if (!res.ok) throw new Error("weather unavailable");
          const data = await res.json();

          let location = "Your location";
          try {
            const geo = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`,
            );
            if (geo.ok) {
              const address = (await geo.json())?.address ?? {};
              location = address.city || address.town || address.village || address.county || location;
            }
          } catch {
            // A missing city name is not a reason to lose the temperature.
          }

          if (cancelled) return;
          setWeather({
            temperature: Math.round(data.current.temperature_2m),
            condition: weatherCondition(data.current.weather_code),
            code: data.current.weather_code,
            humidity: data.current.relative_humidity_2m,
            windSpeed: Math.round(data.current.wind_speed_10m),
            location,
            forecast: data.daily.time.slice(1, 7).map((date: string, i: number) => ({
              date,
              tempMax: Math.round(data.daily.temperature_2m_max[i + 1]),
              tempMin: Math.round(data.daily.temperature_2m_min[i + 1]),
              condition: weatherCondition(data.daily.weather_code[i + 1]),
              code: data.daily.weather_code[i + 1],
            })),
          });
        } catch {
          if (!cancelled) onUnavailable();
        }
      },
      // Permission denied or position unavailable — fall back, silently.
      () => {
        if (!cancelled) onUnavailable();
      },
      { timeout: 8000 },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A skeleton, not an empty box: the permission prompt can sit unanswered for a while, and a blank frame
  // reads as "broken".
  if (!weather) {
    return (
      <div className="flex items-center gap-3" aria-busy>
        <Skeleton className="h-10 w-20 bg-white/20" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24 bg-white/20" />
          <Skeleton className="h-3 w-16 bg-white/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <WeatherIcon code={weather.code} className="h-8 w-8 shrink-0 text-white" />
        <span className="text-3xl font-bold leading-none text-white">{weather.temperature}°</span>
        <div className="min-w-0 text-xs text-white/80">
          <p className="truncate font-medium text-white">{weather.condition}</p>
          <p className="truncate">{weather.location}</p>
        </div>
        <div className="ml-auto space-y-0.5 text-[11px] text-white/70">
          <p className="flex items-center gap-1">
            <Droplets className="h-3 w-3" /> {weather.humidity}%
          </p>
          <p className="flex items-center gap-1">
            <Wind className="h-3 w-3" /> {weather.windSpeed} km/h
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {weather.forecast.map((day) => (
          <div key={day.date} className="min-w-13 rounded-lg bg-white/10 px-2 py-1.5 text-center">
            <p className="text-[10px] text-white/70">
              {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
            </p>
            <WeatherIcon code={day.code} className="mx-auto my-0.5 h-3.5 w-3.5 text-white/90" />
            <p className="text-[11px] font-semibold text-white">
              {day.tempMax}°<span className="font-normal text-white/60">/{day.tempMin}°</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
