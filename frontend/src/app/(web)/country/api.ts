import type { CountryDetail } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getCountryBySlug(slug: string): Promise<CountryDetail | null> {
  const res = await fetch(`${API_BASE}/countries/${slug}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load country");
  return res.json();
}
