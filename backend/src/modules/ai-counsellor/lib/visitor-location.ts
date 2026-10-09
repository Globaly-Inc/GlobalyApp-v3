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

/** Country tier with no region header (a separate Cloudflare setting) proves nothing about their
 * state — a branch may well be in it. Say so rather than "not their state". */
const tierLabel = (location: VisitorLocation, tier: MatchTier) =>
  tier === "country" && !location.region && !location.regionCode
    ? "in the visitor's country; their state is unknown"
    : TIER_LABEL[tier];

/**
 * Where a branch is, as a place: "Melbourne, Victoria, Australia".
 *
 * The street address and the phone are deliberately NOT here, on either path. The owner decision
 * of 2026-10-08 (prompt.service: "Give NO contact route of any kind ... ours included. This
 * overrides every instruction below") sits in the static prefix, and `buildSystemPrompt` emits
 * this section in the volatile `tail` — i.e. BELOW the override. Rendering an address and a phone
 * here therefore never gave the model something it could use; it gave it a contradiction, and a
 * model told to recommend a branch and forbidden to say where it is answers neither well. The
 * same line rag.service already draws: a city is a place, not a contact route.
 *
 * Duplicates collapse, so a city-state ("Singapore, Singapore") says it once.
 */
function placeOf(b: BranchLike): string {
  const seen = new Set<string>();
  return [b.city, b.state, b.country]
    .map((v) => clean(v))
    .filter((v): v is string => !!v && !seen.has(normalizePlace(v)) && !!seen.add(normalizePlace(v)))
    .join(", ");
}

function describe(b: BranchLike): string {
  return [clean(b.name) ?? "Unnamed branch", placeOf(b)].filter(Boolean).join(" · ");
}

export interface BranchInvite {
  name: string;
  /** City, state and country — never the street address. See branchInvite. */
  place: string;
}

/**
 * The branch to offer as an optional in-person visit when the conversation is wrapping up, or
 * null when the location is too coarse for the offer to mean anything.
 *
 * Country tier is exactly that case: "we have an office somewhere in your country" is not
 * proximity, and the visitor may be two thousand kilometres from it. The prompt section still
 * lists those branches if they ask — this is only about volunteering one unprompted.
 *
 * Carries no street address and no phone — see placeOf. The gate is a CITY, not an address: a
 * branch whose only place text is "Victoria, Australia" names a region, and an invite to visit a
 * region is one nobody can act on. The prompt section is laxer, because a branch the visitor
 * ASKED about is worth naming even when its city is missing.
 */
export function branchInvite(match: BranchMatch): BranchInvite | null {
  if (match.tier === "country") return null;
  const name = clean(match.branch.name);
  if (!name || !clean(match.branch.city)) return null;
  return { name, place: placeOf(match.branch) };
}

/** The prompt section. `countryName` is the visitor's country as a name, for readability. */
export function renderLocationSection(location: VisitorLocation, countryName: string, match: BranchMatch): string {
  const others = match.others.slice(0, 5)
    .map((b) => `${clean(b.name) ?? "Unnamed branch"}${b.is_primary ? " (main)" : ""}`);
  return [
    "VISITOR LOCATION (approximate, from the visitor's network — they did not tell you this):",
    `  Country: ${clean(countryName)}`,
    ...(location.region ? [`  Region: ${location.region}`] : []),
    `RECOMMENDED BRANCH (${tierLabel(location, match.tier)}):`,
    `  ${describe(match.branch)}`,
    ...(others.length ? [`  Other branches in ${clean(countryName)}: ${others.join(", ")}`] : []),
    "- Mention a branch only when the visitor asks about visiting, campuses, where you are, which " +
      "office is nearest or closest to them, or studying or meeting someone in person. Otherwise " +
      "ignore this section.",
    // Asked outright, the one thing the counsellor must not do is stonewall. It knows the office
    // and the city; "we do not have that on file" is false, and a vague "we have several offices"
    // when the visitor asked which one is theirs is the same failure in a politer register.
    "- When they ask outright, ANSWER: name the branch above and the place it is in. Never refuse " +
      "this or claim it is not on file — it is, immediately above.",
    match.tier !== "country"
      ? "- You may say the branch is in their state or area. Never call it the nearest or closest — distance is unknown. " +
        "Asked outright for the nearest, name this one and say plainly that it is the one in their state or area, " +
        "and that you cannot measure the distance."
      : location.region || location.regionCode
        ? "- No branch is in their state. Do not imply one is close to them; list the branches in their country instead. " +
          "Asked outright for the nearest, say none is in their state, name the ones in their country, and let them pick."
        : "- Their state is unknown. Do not say whether any branch is in or near their state; list the branches in their country instead. " +
          "Asked outright for the nearest, say you cannot tell which is closest, name the ones in their country, and let them pick.",
    // The override in the static prefix already forbids every contact route; this says what is
    // LEFT, so the model does not read that rule as covering the branch's existence too.
    "- Give the place only — the office and its city. No street address and no phone number, even " +
      "if the visitor asks for one directly; offer to put them in touch with the team instead.",
    "- Do not tell the visitor you know where they are unless they ask how you know; then say it is an " +
      "approximate guess from their connection.",
  ].join("\n");
}
