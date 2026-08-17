import type { CityDetail } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getCityBySlug(citySlug: string, countrySlug?: string): Promise<CityDetail | null> {
  const qs = countrySlug ? `?country=${encodeURIComponent(countrySlug)}` : "";
  const res = await fetch(`${API_BASE}/cities/${citySlug}${qs}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load city");
  return res.json();
}
