import type { Destination } from "./destinations";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

type FeaturedCountryRow = {
  id: number;
  name: string;
  slug: string | null;
  flag_emoji: string | null;
  hero_image_url: string | null;
};

export async function getFeaturedCountries(): Promise<Destination[]> {
  const res = await fetch(`${API_BASE}/countries/featured`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load featured countries");
  const { countries } = (await res.json()) as { countries: FeaturedCountryRow[] };
  return countries.map((c) => ({
    id: String(c.id),
    name: c.name,
    slug: c.slug ?? "",
    flagEmoji: c.flag_emoji ?? "🌐",
    heroImageUrl: c.hero_image_url ?? null,
  }));
}
