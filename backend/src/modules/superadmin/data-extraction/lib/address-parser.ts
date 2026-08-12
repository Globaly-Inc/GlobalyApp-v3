// Lightweight, country-aware address splitter for free-text addresses.
// Best-effort: returns whatever it can parse, leaves the rest in street1.
// Ported from V2 _shared/address-parser.ts. Pure function, no deps.

export interface ParsedAddress {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  address: string | null; // normalised full string
}

const EMPTY: ParsedAddress = {
  street1: null, street2: null, city: null, state: null, postcode: null, country: null, address: null,
};

// Two-letter state/territory codes — US + AU + common IN/CA/PH/NG/PK/ID codes.
const STATE_CODES = new Set([
  // US
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WV","WI","WY","DC",
  // Australia
  "NSW","VIC","QLD","WA","SA","TAS","ACT","NT",
  // Canada
  "ON","QC","BC","AB","MB","SK","NS","NB","NL","PE","YT","NU",
  // India
  "HR","KA","MH","TN","UP","WB","DL","GJ","PB","RJ","KL","AP","TS","OD","BR","MP","CG","JH","HP","JK",
  "GA","AS","ML","MN","MZ","NL","TR","AR",
  // Philippines
  "CEB","NCR","BTN","BUL","CAV","LAG","RIZ",
  // Nigeria
  "LA","FC",
  // Pakistan
  "KP","BA","IS",
  // Indonesia
  "JK","JB","JT","JI","BT","SU","SS","SB",
]);

const STATE_RE = new RegExp(`\\b(${Array.from(STATE_CODES).join("|")})\\b`);

const FULL_STATE_NAMES: Record<string, string> = {
  // Australia
  "new south wales": "NSW", "victoria": "VIC", "queensland": "QLD",
  "western australia": "WA", "south australia": "SA", "tasmania": "TAS",
  "australian capital territory": "ACT", "northern territory": "NT",
  // Canada
  "ontario": "ON", "quebec": "QC", "british columbia": "BC", "alberta": "AB",
  "manitoba": "MB", "saskatchewan": "SK", "nova scotia": "NS", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "prince edward island": "PE",
  // India
  "haryana": "HR", "karnataka": "KA", "maharashtra": "MH", "tamil nadu": "TN",
  "uttar pradesh": "UP", "west bengal": "WB", "delhi": "DL", "gujarat": "GJ",
  "punjab": "PB", "rajasthan": "RJ", "kerala": "KL", "andhra pradesh": "AP",
  "telangana": "TS", "odisha": "OD", "bihar": "BR", "madhya pradesh": "MP",
  "chhattisgarh": "CG", "jharkhand": "JH", "himachal pradesh": "HP",
  "jammu and kashmir": "JK", "goa": "GA", "assam": "AS",
  // US subset
  "california": "CA", "new york": "NY", "texas": "TX", "florida": "FL",
  "illinois": "IL", "washington": "WA", "massachusetts": "MA", "pennsylvania": "PA",
};

// Postcode patterns: ordered by specificity.
const POSTCODE_RES: RegExp[] = [
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i, // UK
  /\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/i,            // Canada
  /\b(\d{5}(?:-\d{4})?)\b/,                      // US ZIP / ZIP+4
  /\b(\d{6})\b/,                                  // India
  /\b(\d{4})\b/,                                  // AU / NZ / EU
];

function clean(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function segmentAsState(seg: string): string | null {
  const t = clean(seg).replace(/^[-,\s]+|[-,\s]+$/g, "");
  if (!t) return null;
  const upper = t.toUpperCase();
  if (STATE_CODES.has(upper) && upper.length <= 4) return upper;
  const lower = t.toLowerCase();
  if (FULL_STATE_NAMES[lower]) return FULL_STATE_NAMES[lower];
  return null;
}

function looksLikeStateCode(v: string | null): boolean {
  if (!v) return false;
  const t = v.trim();
  return /^[A-Z]{2,4}$/.test(t) && STATE_CODES.has(t);
}

function stripPunctNoise(v: string | null): string | null {
  if (!v) return v;
  const t = v.replace(/^[-,\s]+|[-,\s]+$/g, "").trim();
  if (/^-?\d{1,4}-?$/.test(t)) return null;
  return t || null;
}

export function parseAddress(raw: string | null | undefined, hintedCountry?: string | null): ParsedAddress {
  if (!raw) return EMPTY;
  let s = String(raw)
    .replace(/<\s*br\s*\/?>/gi, ", ")
    .replace(/\n+/g, ", ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^,|,$/g, "")
    .trim();
  if (!s) return EMPTY;

  const parts = s.split(",").map(p => clean(p)).filter(Boolean);

  let country: string | null = hintedCountry ? clean(hintedCountry) : null;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (!/\d/.test(last) && last.split(" ").length <= 4 && last.length >= 3 && !segmentAsState(last)) {
      country = country || last;
      parts.pop();
    }
  }

  let postcode: string | null = null;
  let state: string | null = null;
  let cityFromTrailing: string | null = null;

  if (parts.length > 0) {
    const tail = parts[parts.length - 1];
    for (const re of POSTCODE_RES) {
      const m = tail.match(re);
      if (m) { postcode = m[1].toUpperCase().replace(/\s+/g, " "); break; }
    }
    const ms = tail.match(STATE_RE);
    if (ms) state = ms[1].toUpperCase();

    let rest = tail;
    if (postcode) rest = rest.replace(postcode, "");
    if (state) rest = rest.replace(new RegExp(`\\b${state}\\b`), "");
    rest = clean(rest).replace(/^[-,\s]+|[-,\s]+$/g, "");
    if (rest) cityFromTrailing = rest;

    if (postcode || state || cityFromTrailing) parts.pop();
  }

  if (parts.length > 0 && !state) {
    const maybeState = segmentAsState(parts[parts.length - 1]);
    if (maybeState) {
      state = maybeState;
      parts.pop();
    }
  }

  let city: string | null = cityFromTrailing;
  if (city && looksLikeStateCode(city)) {
    if (!state) state = city.toUpperCase();
    city = null;
  }
  if (!city && parts.length > 1) city = parts.pop() || null;

  if (city && looksLikeStateCode(city)) {
    if (!state) state = city.toUpperCase();
    city = parts.length > 1 ? (parts.pop() || null) : null;
  }

  city = stripPunctNoise(city);
  if (!city && parts.length > 1) city = parts.pop() || null;

  const street1 = parts.shift() || null;
  const street2 = parts.length > 0 ? parts.join(", ") : null;

  return { street1, street2, city, state, postcode, country, address: s };
}

// ponytail: self-check
if (import.meta.url.endsWith("/address-parser.ts") && process.argv[1]?.endsWith("address-parser.ts")) {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
  const r1 = parseAddress("123 Main St, Sydney, NSW 2000, Australia");
  assert(r1.street1 === "123 Main St", `street1: ${r1.street1}`);
  assert(r1.city === "Sydney", `city: ${r1.city}`);
  assert(r1.state === "NSW", `state: ${r1.state}`);
  assert(r1.postcode === "2000", `postcode: ${r1.postcode}`);
  assert(r1.country === "Australia", `country: ${r1.country}`);
  const r2 = parseAddress(null);
  assert(r2.street1 === null, "null input returns empty");
  const r3 = parseAddress("10 Downing Street, London, SW1A 2AA");
  assert(r3.postcode === "SW1A 2AA", `UK postcode: ${r3.postcode}`);
  console.log("address-parser: all checks passed");
}
