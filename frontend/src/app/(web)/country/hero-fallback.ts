import type { CountryDetail } from "./types";

// Per-country landmark fallback for countries an admin hasn't set a hero_image_url for yet —
// covers the countries linked from the footer's "Explore Destinations". Any other country falls
// back to a generic study-abroad photo (V2's own single fallback) rather than nothing at all.
// Shared by the hero banner and, as a last resort, city cards that have no photo of their own.
const GENERIC_FALLBACK_HERO = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400";
const PEXELS_PARAMS = "?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const COUNTRY_HERO_FALLBACKS: Record<string, string> = {
  Australia: `https://images.pexels.com/photos/33378301/pexels-photo-33378301.jpeg${PEXELS_PARAMS}`,
  Canada: `https://images.pexels.com/photos/25696388/pexels-photo-25696388.jpeg${PEXELS_PARAMS}`,
  "United States": `https://images.pexels.com/photos/1461370/pexels-photo-1461370.jpeg${PEXELS_PARAMS}`,
  "United Kingdom": `https://images.pexels.com/photos/575410/pexels-photo-575410.jpeg${PEXELS_PARAMS}`,
  Singapore: `https://images.pexels.com/photos/18280158/pexels-photo-18280158.jpeg${PEXELS_PARAMS}`,
};

export function getCountryHeroImage(country: Pick<CountryDetail, "name" | "hero_image_url">): string {
  return country.hero_image_url ?? COUNTRY_HERO_FALLBACKS[country.name] ?? GENERIC_FALLBACK_HERO;
}

// Curating an accurate photo per city isn't practical at the scale of "every city in every
// seeded country" — instead, cities without their own photo get a deterministic pick from this
// pool (by id), so siblings in the same carousel don't all show the identical fallback image.
const CITY_FALLBACK_POOL = [
  "https://images.pexels.com/photos/14840760/pexels-photo-14840760.jpeg",
  "https://images.pexels.com/photos/15629500/pexels-photo-15629500.jpeg",
  "https://images.pexels.com/photos/286720/pexels-photo-286720.jpeg",
  "https://images.pexels.com/photos/11677347/pexels-photo-11677347.jpeg",
  "https://images.pexels.com/photos/13766345/pexels-photo-13766345.jpeg",
  "https://images.pexels.com/photos/30147234/pexels-photo-30147234.jpeg",
  "https://images.pexels.com/photos/17231081/pexels-photo-17231081.jpeg",
  "https://images.pexels.com/photos/17131944/pexels-photo-17131944.jpeg",
  "https://images.pexels.com/photos/18284204/pexels-photo-18284204.jpeg",
  "https://images.pexels.com/photos/22873529/pexels-photo-22873529.jpeg",
  "https://images.pexels.com/photos/19972118/pexels-photo-19972118.jpeg",
  "https://images.pexels.com/photos/35134274/pexels-photo-35134274.jpeg",
].map((url) => `${url}${PEXELS_PARAMS}`);

export function getCityFallbackImage(cityId: number): string {
  return CITY_FALLBACK_POOL[cityId % CITY_FALLBACK_POOL.length]!;
}
