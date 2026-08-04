export type Destination = {
  id: string;
  name: string;
  slug: string;
  flagEmoji: string;
};

/**
 * ponytail: static list standing in for GET /countries (V2's src/services/geo)
 * until the V3 backend exists. Swap for a real fetch once /backend ships.
 */
export const DESTINATIONS: Destination[] = [
  { id: "au", name: "Australia", slug: "australia", flagEmoji: "🇦🇺" },
  { id: "us", name: "United States", slug: "united-states", flagEmoji: "🇺🇸" },
  { id: "ca", name: "Canada", slug: "canada", flagEmoji: "🇨🇦" },
  { id: "uk", name: "United Kingdom", slug: "united-kingdom", flagEmoji: "🇬🇧" },
  { id: "sg", name: "Singapore", slug: "singapore", flagEmoji: "🇸🇬" },
  { id: "de", name: "Germany", slug: "germany", flagEmoji: "🇩🇪" },
  { id: "nz", name: "New Zealand", slug: "new-zealand", flagEmoji: "🇳🇿" },
  { id: "ie", name: "Ireland", slug: "ireland", flagEmoji: "🇮🇪" },
];
