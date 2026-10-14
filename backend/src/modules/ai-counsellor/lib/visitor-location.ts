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

/** One pin the widget can show: a campus the reply actually mentioned. */
export interface MapLocation {
  /** Position in the branch list — the frontend only needs it to mark the selected pin. */
  id: string;
  name: string;
  /** What the map resolves. City, state and country — the same `placeOf` the prompt section uses,
   *  so the pin can never be more precise than the text already was. See the 2026-10-08 rule.
   *
   *  The campus NAME is deliberately not in here. Google resolves "AIT Main Campus, Bangkok" to
   *  the campus itself — its marker, its label, its street address in the info card — which is the
   *  disclosure the whole rule removes, and a wide `zoom` only frames that pin from further away.
   *  The name still rides along in `name` for the chip and the link text, where it is prose. */
  query: string;
  /** The campus chip above the map: the city alone, which is how a visitor names a campus. */
  label: string;
}

/** Longer than this and the chips wrap into a wall in a 380px panel. */
const MAX_PINS = 6;

/**
 * Did the VISITOR ask about a place or how to reach us? The map's first gate.
 *
 * Owner decision, 2026-10-14: the reply alone was the trigger, and a counsellor names the campus
 * city in almost every answer ("our Bangkok campus runs it in January"), so a map ended up under
 * replies about intakes and fees. Showing it there is noise — the visitor asked about a course.
 *
 * The two gates do different jobs and both are needed: this one says a map belongs on this turn
 * at all, `mapLocationsFor` says WHICH campuses, from what the reply actually named. A location
 * question whose answer names no pinnable campus still shows no map.
 *
 * Contact words are in deliberately. The widget may give no phone, email or address (the privacy
 * rule in prompt.service), so a map of where we are is the most useful thing "how do I contact
 * you?" can be answered with.
 */
export function asksAboutPlace(asked: string): boolean {
  return /\b(where|located|location|locations|campus|campuses|branch|branches|office|offices|address|directions|map|visit|visiting|nearest|near me|contact|phone|email|reach you|get in touch)\b/
    .test(normalizePlace(asked));
}

/** Words that appear in a campus name without naming a place. "Our main campus" must not pin every
 *  branch called "Main Campus", and "the university" must not pin "University Campus". */
const GENERIC_PLACE_WORDS = new Set([
  "campus", "campuses", "centre", "center", "office", "branch", "main", "head", "city",
  "university", "college", "institute", "school", "academy", "ward", "district", "area",
  "north", "south", "east", "west", "central", "new", "old", "the", "and",
]);

/**
 * Which campuses to pin, given the reply the model just wrote.
 *
 * Server-side and deterministic, the same way the `link` block is: the model never names a place
 * and never writes a query, so it cannot pin a campus that is not in the branch table, and it
 * cannot walk the address back in through a block.
 *
 * The trigger is simply whether the finished reply MENTIONS a campus — its name or its city, as
 * whole words. A reply about fees names no city and gets no map; "our Bangkok and Hanoi campuses"
 * gets both. No intent regex and no prompt budget: the reply itself is the signal, and the prompt
 * prefix is already paid for on every turn.
 *
 * ponytail: a country word inside a campus name is distinctive enough to match, so "…in Hanoi,
 * Vietnam" also pins a "Vietnam (Ho Chi Minh) Campus". Both pins are real campuses in the right
 * places, so this is a breadth the prose does not promise rather than a wrong pin; narrow it by
 * resolving country words out of names if it ever reads badly.
 *
 * A branch with no city or no country is skipped even when named. Google resolves whatever string
 * it is handed, so a thin row would produce a confident pin in the wrong place — worse than no
 * map, because it looks authoritative. Absent rather than wrong, the same rule branchInvite follows.
 */
export function mapLocationsFor(reply: string, branches: readonly BranchLike[]): MapLocation[] {
  const haystack = ` ${normalizePlace(reply)} `;
  // The reply's words, plus every adjacent pair and triple joined up. One place is routinely
  // spelled two ways — the row says "Pathumthani", the counsellor writes "Pathum Thani" — and on
  // the live AIT widget that dropped the Thai campus off a map that pinned both Vietnamese ones.
  // Joining adjacent TOKENS rather than squashing the whole string is what keeps word boundaries
  // intact: "Hanoian" still does not contain the city Hanoi.
  const replyWords = normalizePlace(reply).split(" ").filter(Boolean);
  const tokens = new Set(replyWords);
  for (let i = 0; i + 1 < replyWords.length; i++) {
    tokens.add(replyWords[i] + replyWords[i + 1]);
    if (i + 2 < replyWords.length) tokens.add(replyWords[i] + replyWords[i + 1] + replyWords[i + 2]);
  }
  /** The whole phrase, or any distinctive word of it — the same test namesSubject applies to
   *  subject areas. Whole-phrase-only was too strict to ever fire: a counsellor writes "our Hanoi
   *  campus", while the row is named "Vietnam (Hanoi) Campus", and those never matched. */
  const mentions = (v: string | null | undefined) => {
    const text = normalizePlace(v);
    if (!text) return false;
    // A phrase made only of generic words names no place, so it can never match — not even in
    // full. Without this, a branch called "Main Campus" pinned itself on any reply containing the
    // words "main campus", which is most replies about a campus.
    const words = text.split(" ").filter((w) => !GENERIC_PLACE_WORDS.has(w));
    if (!words.length) return false;
    if (haystack.includes(` ${text} `)) return true;
    // Spacing differs on one side or the other: compare both with the spaces taken out.
    if (tokens.has(text.replace(/ /g, ""))) return true;
    // Only now the length floor, because it belongs to THIS test alone: one word out of a campus
    // name standing in for the whole thing is a guess, and a short one ("new", "ait") coincides
    // with ordinary prose. The two exact tests above need no such protection, which is why a
    // three-letter city — Goa, Hue, Rio — still pins when the reply names it.
    return words.filter((w) => w.length >= 4).some((w) => tokens.has(w));
  };
  const pins: MapLocation[] = [];
  // One pin per PLACE, not per row. An extracted catalogue routinely holds the same address three
  // times — "ACECOMS, AIT", "ACECOMS" and the library are all one campus — and three chips reading
  // "Pathumthani, Pathumthani, Pathumthani" is the map admitting it cannot tell them apart.
  const seenPlace = new Set<string>();
  branches.forEach((b, i) => {
    // A sub-country place is the gate, not a full address: a pin on a country centroid says
    // nothing a visitor can use — the same reason branchInvite refuses the country tier. `placeOf`
    // still adds the country to the query when the row has one.
    const place = clean(b.city) ?? clean(b.state);
    if (!place) return;
    if (!mentions(b.name) && !mentions(b.city) && !mentions(b.state)) return;
    const where = placeOf(b);
    if (seenPlace.has(normalizePlace(where))) return;
    seenPlace.add(normalizePlace(where));
    const name = clean(b.name) ?? place;
    // `where`, not `${name}, ${where}` — the query is the place and only the place. See MapLocation.
    // The pins are one-per-place anyway, so naming the campus never disambiguated anything either.
    pins.push({ id: `b${i}`, name, query: where, label: place });
  });
  return pins.slice(0, MAX_PINS);
}
