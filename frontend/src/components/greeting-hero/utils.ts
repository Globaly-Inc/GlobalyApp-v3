export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Open-Meteo WMO weather code → a human label. */
export function weatherCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 69) return "Rainy";
  if (code <= 79) return "Snowy";
  if (code <= 99) return "Stormy";
  return "Cloudy";
}

export type WeatherSnapshot = {
  temperature: number;
  condition: string;
  /** Raw WMO code — kept so the icon is chosen from the code, not parsed back out of the label. */
  code: number;
  humidity: number;
  windSpeed: number;
  location: string;
  forecast: { date: string; tempMax: number; tempMin: number; condition: string; code: number }[];
};

export const MAX_WORLD_CLOCKS = 5;

/** localStorage keys per portal, so a business and a personal home keep their own choices. */
export function heroStorageKeys(prefix: string) {
  return { widget: `${prefix}-home-widget`, timezone: `${prefix}-timezone`, worldClocks: `${prefix}-world-clocks` };
}

/** Intl provides the timezone list — no constants file, no date library. */
export function allZones(): string[] {
  return typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];
}
