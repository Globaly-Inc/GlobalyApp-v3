import type { FeatureUsage, GrowthPoint } from "../apis/types";
import type { ChartPoint, ViewMode } from "../types";

export function formatStatValue(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export function mostUsedFeature(features: FeatureUsage[]): FeatureUsage | null {
  if (features.length === 0) return null;
  return features.reduce((best, f) => (f.count > best.count ? f : best));
}

export function totalActivity(features: FeatureUsage[]): number {
  return features.reduce((sum, f) => sum + f.count, 0);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucketStart(d: Date, mode: ViewMode): Date {
  if (mode === "week") {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    return startOfDay(monday);
  }
  if (mode === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfDay(d);
}

function bucketLabel(d: Date, mode: ViewMode): string {
  if (mode === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Fill the full window with zero-count buckets, then overlay the sparse daily points from the API. */
export function buildSeries(points: GrowthPoint[], days: number, mode: ViewMode): ChartPoint[] {
  const counts = new Map<number, number>();
  for (const p of points) {
    counts.set(startOfDay(new Date(p.day)).getTime(), p.count);
  }

  const buckets = new Map<number, ChartPoint>();
  const start = startOfDay(new Date(Date.now() - (days - 1) * 86_400_000));
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const bucket = bucketStart(day, mode);
    const key = bucket.getTime();
    const existing = buckets.get(key);
    const dayCount = counts.get(day.getTime()) ?? 0;
    if (existing) existing.count += dayCount;
    else buckets.set(key, { label: bucketLabel(bucket, mode), count: dayCount });
  }
  return [...buckets.values()];
}

export function applyCumulative(data: ChartPoint[]): ChartPoint[] {
  let cum = 0;
  return data.map((d) => ({ label: d.label, count: (cum += d.count) }));
}
