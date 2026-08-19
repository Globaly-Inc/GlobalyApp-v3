"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, CloudSnow, CloudSun, Sun, Wind } from "lucide-react";
import { weatherCondition } from "../utils";
import type { WeatherSnapshot } from "../types";

/**
 * V1's WeatherDisplay layout: one right-aligned row — icon + temperature, then condition/location/metrics,
 * then a 7-day strip separated by a left border, each day a min-w-[48px] column.
 *
 * Secondary by design. Open-Meteo and Nominatim are unauthenticated third parties, so nothing on Home awaits
 * this: on a denied permission or any failure it calls onUnavailable() and the hero shows world clocks
 * instead — no toast, no empty weather frame. Re-selecting the weather toggle retries.
 */

/**
 * V1 maps the condition label to an icon and a colour. Returned as JSX rather than a component reference:
 * picking a component inside render resets its state on every pass, which the lint rule rightly rejects.
 */
function WeatherIcon({ condition, className }: { condition: string; className?: string }) {
  switch (condition) {
    case "Clear":
      return <Sun className={className} />;
    case "Partly cloudy":
      return <CloudSun className={className} />;
    case "Rainy":
    case "Stormy":
      return <CloudRain className={className} />;
    case "Snowy":
      return <CloudSnow className={className} />;
    default:
      return <Cloud className={className} />;
  }
}

function colorFor(condition: string) {
  switch (condition) {
    case "Clear":
      return "text-yellow-300";
    case "Partly cloudy":
      return "text-white/90";
    case "Rainy":
      return "text-blue-300";
    case "Snowy":
      return "text-white";
    case "Stormy":
      return "text-purple-300";
    default:
      return "text-white/80";
  }
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
            forecast: data.daily.time.slice(1, 8).map((date: string, i: number) => ({
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

  // V1's wording while the geolocation prompt is unanswered — not an empty frame, which reads as broken.
  if (!weather) return <div className="text-sm text-white/60 text-right">Loading weather…</div>;

  return (
    <div className="md:text-right">
      <div className="flex md:justify-end gap-3 items-center">
        <div className="flex items-center gap-2">
          <WeatherIcon condition={weather.condition} className={`h-8 w-8 ${colorFor(weather.condition)}`} />
          <span className="text-2xl font-semibold text-white">{weather.temperature}°C</span>
        </div>

        <div className="text-left">
          <p className="text-sm text-white/90 font-medium">{weather.condition}</p>
          <p className="text-xs text-white/70">{weather.location}</p>
          <div className="flex items-center gap-2 text-xs text-white/60 mt-0.5">
            <span>💧 {weather.humidity}%</span>
            <span className="flex items-center gap-0.5">
              <Wind className="h-3 w-3" /> {weather.windSpeed} km/h
            </span>
          </div>
        </div>

        {/* 7-day forecast (desktop only), as V1 */}
        <div className="hidden lg:flex items-center gap-2 ml-4 pl-4 border-l border-white/20">
          {weather.forecast.slice(0, 7).map((day) => (
            <div key={day.date} className="flex flex-col items-center text-center min-w-[48px]">
              <span className="text-xs text-white/60">
                {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <WeatherIcon condition={day.condition} className="h-4 w-4 text-white/80 my-0.5" />
              <span className="text-xs text-white/90">{day.tempMax}°</span>
              <span className="text-xs text-white/50">{day.tempMin}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
