// Where a widget visitor is, from the location headers Cloudflare adds, and which of the
// institution's existing branches is most relevant to them.
//
// Nothing here is stored: the visitor table and the branch table are read-only to this feature.
// The result is one prompt section for one turn, and when anything is missing it is simply
// absent, so the chat behaves exactly as it did before.
//
// "Most relevant", not "nearest": branches carry country/state/city/address text and no
// coordinates, so the best this can honestly say is "in your state". The prompt section tells
// the model the same.
//
// Pure functions only (no DB, no env) so they can be tested directly; the loader lives in
// visitor.service.branchRecommendationFor.

export interface LocationHeaderNames {
  country: string;
  region: string;
  regionCode: string;
}

export interface VisitorLocation {
  /** ISO 3166-1 alpha-2, uppercase. Always present: a region without a country is useless. */
  country: string;
  /** Full region name, e.g. "Victoria". */
  region: string | null;
  /** Region code, e.g. "VIC". */
  regionCode: string | null;
}

export interface BranchLike {
  name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone?: string | null;
  is_primary?: boolean | null;
}

/** A branch with its `country` text already resolved to ISO2 (null when it matches none). */
export type ResolvedBranch = BranchLike & { iso2: string | null };

export type MatchTier = "state" | "area" | "country";

export interface BranchMatch {
  tier: MatchTier;
  branch: ResolvedBranch;
  /** The visitor's country's other branches, primary first. */
  others: ResolvedBranch[];
}

type Headers = Record<string, string | string[] | undefined>;

/** Cloudflare's "no idea" (XX) and Tor (T1) are not countries. */
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

/** Header values are untrusted when the API is reachable without Cloudflare in front, and they
 * end up in the prompt: one line, bounded. */
function clean(v: string | null | undefined, max = 120): string | null {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

function header(headers: Headers, name: string): string | null {
  if (!name) return null; // an empty env value switches that header off
  const raw = headers[name.toLowerCase()];
  return clean(Array.isArray(raw) ? raw[0] : raw, 80);
}

export function readVisitorLocation(headers: Headers, names: LocationHeaderNames): VisitorLocation | null {
  const country = header(headers, names.country)?.toUpperCase() ?? null;
  if (!country || !/^[A-Z]{2}$/.test(country) || NOT_A_COUNTRY.has(country)) return null;
  return {
    country,
    region: header(headers, names.region),
    regionCode: header(headers, names.regionCode),
  };
}

/** Case, accents, punctuation and spacing ignored: "New South Wales" = "new-south  wales". */
export function normalizePlace(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Domestic = at least one branch is in the visitor's country. */
export function isDomestic(location: VisitorLocation, branches: ResolvedBranch[]): boolean {
  return branches.some((b) => b.iso2 === location.country);
}

/**
 * The visitor's best branch, or null when they are not domestic.
 *
 * Tiers, first hit wins: branch state equals the region name or code → the region name appears
 * as whole words in the branch city or address (city-states, or a state stored in the address)
 * → any branch in the country. Within a tier the primary branch wins, then the caller's order.
 * The code is deliberately not used for the city/address tier: "WA" or "NT" as a substring of
 * an address is a coincidence, not a location.
 */
export function rankBranches(location: VisitorLocation, branches: ResolvedBranch[]): BranchMatch | null {
  const local = branches
    .filter((b) => b.iso2 === location.country)
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary)); // stable: caller order otherwise
  if (!local.length) return null;

  const regions = [location.region, location.regionCode].map(normalizePlace).filter(Boolean);
  const regionName = normalizePlace(location.region);
  const hasWords = (hay: string | null) => !!regionName && ` ${normalizePlace(hay)} `.includes(` ${regionName} `);

  let tier: MatchTier = "country";
  let branch = local.find((b) => b.state && regions.includes(normalizePlace(b.state)));
  if (branch) tier = "state";
  else {
    branch = local.find((b) => hasWords(b.city) || hasWords(b.address));
    if (branch) tier = "area";
  }
  branch ??= local[0];
  return { tier, branch, others: local.filter((b) => b !== branch) };
}

const TIER_LABEL: Record<MatchTier, string> = {
  state: "in the visitor's state",
  area: "in the visitor's area",
  country: "in the visitor's country, not their state",
};

function describe(b: BranchLike): string {
  const address = clean(b.address);
  // An address often already contains the city/state; don't repeat what it says.
  const inAddress = ` ${normalizePlace(address)} `;
  const rest = [b.city, b.state, b.country]
    .map((v) => clean(v))
    .filter((p): p is string => !!p && !inAddress.includes(` ${normalizePlace(p)} `));
  const place = [address, ...rest].filter(Boolean).join(", ");
  return [clean(b.name) ?? "Unnamed branch", place, clean(b.phone, 40)].filter(Boolean).join(" · ");
}

/** The prompt section. `countryName` is the visitor's country as a name, for readability. */
export function renderLocationSection(location: VisitorLocation, countryName: string, match: BranchMatch): string {
  const others = match.others.slice(0, 5)
    .map((b) => `${clean(b.name) ?? "Unnamed branch"}${b.is_primary ? " (main)" : ""}`);
  return [
    "VISITOR LOCATION (approximate, from the visitor's network — they did not tell you this):",
    `  Country: ${clean(countryName)}`,
    ...(location.region ? [`  Region: ${location.region}`] : []),
    `RECOMMENDED BRANCH (${TIER_LABEL[match.tier]}):`,
    `  ${describe(match.branch)}`,
    ...(others.length ? [`  Other branches in ${clean(countryName)}: ${others.join(", ")}`] : []),
    "- Mention a branch only when the visitor asks about visiting, campuses, where you are, or " +
      "studying or meeting someone in person. Otherwise ignore this section.",
    match.tier === "country"
      ? "- No branch is in their state. Do not imply one is close to them; list the branches in their country instead."
      : "- You may say the branch is in their state or area. Never call it the nearest or closest — distance is unknown.",
    "- Do not tell the visitor you know where they are unless they ask how you know; then say it is an " +
      "approximate guess from their connection.",
  ].join("\n");
}
