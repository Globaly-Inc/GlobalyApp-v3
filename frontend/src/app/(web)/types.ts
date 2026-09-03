/** Wire shape of GET /api/v3/platform-stats. */
export type PlatformStats = {
  institutions: number;
  courses: number;
  educationCounselors: number;
  countries: number;
  cities: number;
  students: number;
  verifiedBusinesses: number;
  serviceListings: number;
};

export type PlatformStatKey = keyof PlatformStats;

/**
 * Stat bars show the true count — no "+" suffix, which would imply headroom the number does
 * not have. Thousands separators keep large figures readable once the catalog grows.
 *
 * A stat with no data reads "0" rather than a dash: the count is genuinely zero, and a dash
 * reads as "broken" next to siblings that do have numbers.
 */
export function formatStatValue(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-US");
}
