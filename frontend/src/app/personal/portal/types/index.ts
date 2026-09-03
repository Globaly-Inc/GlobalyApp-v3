export type SectionErrorProps = { message: string; onRetry: () => void };

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
