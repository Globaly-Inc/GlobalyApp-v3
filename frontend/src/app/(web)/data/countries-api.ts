import type { Destination } from "./destinations";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

type FeaturedCountryRow = {
  id: number;
  name: string;
  slug: string | null;
  flag_emoji: string | null;
  iso2: string | null;
  hero_image_url: string | null;
  thumbnail_image_url: string | null;
  universities_count_label: string | null;
  avg_tuition_min: number | string | null;
  avg_tuition_max: number | string | null;
  avg_tuition_currency: string | null;
  cost_of_living_label: string | null;
};

// `avg_tuition_*` are numeric columns, which pg hands back as strings.
const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

export async function getFeaturedCountries(): Promise<Destination[]> {
  const res = await fetch(`${API_BASE}/countries/featured`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load featured countries");
  const { countries } = (await res.json()) as { countries: FeaturedCountryRow[] };
  return countries.map((c) => ({
    id: String(c.id),
    name: c.name,
    slug: c.slug ?? "",
    flagEmoji: c.flag_emoji ?? "🌐",
    heroImageUrl: c.hero_image_url ?? c.thumbnail_image_url ?? null,
    code: c.iso2 ?? null,
    institutionsLabel: c.universities_count_label ?? null,
    tuitionMin: num(c.avg_tuition_min),
    tuitionMax: num(c.avg_tuition_max),
    tuitionCurrency: c.avg_tuition_currency ?? null,
    livingCostLabel: c.cost_of_living_label ?? null,
  }));
}
