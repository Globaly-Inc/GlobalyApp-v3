// Agent data normalization — country aliases, state expansion, phone formatting,
// address splitting, agent row normalization. Pure functions, no IO.
// Ported from V2 _shared/agent-normalizers.ts.

// ── Country aliases ──

const COUNTRY_ALIASES: Record<string, string> = {
  AU: "Australia", AUS: "Australia", AUSTRALIA: "Australia",
  NZ: "New Zealand", NZL: "New Zealand", "NEW ZEALAND": "New Zealand",
  US: "United States", USA: "United States", "UNITED STATES": "United States",
  "UNITED STATES OF AMERICA": "United States", AMERICA: "United States",
  UK: "United Kingdom", GB: "United Kingdom", GBR: "United Kingdom",
  "UNITED KINGDOM": "United Kingdom", BRITAIN: "United Kingdom",
  "GREAT BRITAIN": "United Kingdom", ENGLAND: "United Kingdom",
  CA: "Canada", CAN: "Canada", CANADA: "Canada",
  IE: "Ireland", IRL: "Ireland", IRELAND: "Ireland",
  IN: "India", IND: "India", INDIA: "India",
  NP: "Nepal", NPL: "Nepal", NEPAL: "Nepal",
  BD: "Bangladesh", BGD: "Bangladesh", BANGLADESH: "Bangladesh",
  PK: "Pakistan", PAK: "Pakistan", PAKISTAN: "Pakistan",
  LK: "Sri Lanka", LKA: "Sri Lanka", "SRI LANKA": "Sri Lanka",
  PH: "Philippines", PHL: "Philippines", PHILIPPINES: "Philippines",
  VN: "Vietnam", VNM: "Vietnam", VIETNAM: "Vietnam",
  MY: "Malaysia", MYS: "Malaysia", MALAYSIA: "Malaysia",
  SG: "Singapore", SGP: "Singapore", SINGAPORE: "Singapore",
  ID: "Indonesia", IDN: "Indonesia", INDONESIA: "Indonesia",
  TH: "Thailand", THA: "Thailand", THAILAND: "Thailand",
  CN: "China", CHN: "China", CHINA: "China",
  JP: "Japan", JPN: "Japan", JAPAN: "Japan",
  KR: "South Korea", KOR: "South Korea", "SOUTH KOREA": "South Korea",
  DK: "Denmark", DNK: "Denmark", DENMARK: "Denmark",
  BR: "Brazil", BRA: "Brazil", BRAZIL: "Brazil",
};

const TLD_TO_COUNTRY: Record<string, string> = {
  au: "Australia", nz: "New Zealand", uk: "United Kingdom", ie: "Ireland",
  dk: "Denmark", ca: "Canada", us: "United States", in: "India", np: "Nepal",
  bd: "Bangladesh", pk: "Pakistan", lk: "Sri Lanka", ph: "Philippines",
  vn: "Vietnam", my: "Malaysia", sg: "Singapore", id: "Indonesia",
  th: "Thailand", cn: "China", jp: "Japan", kr: "South Korea", br: "Brazil",
};

// ── State / region tables ──

const STATE_BY_COUNTRY: Record<string, Record<string, string>> = {
  Australia: {
    VIC: "Victoria", NSW: "New South Wales", QLD: "Queensland",
    SA: "South Australia", WA: "Western Australia", TAS: "Tasmania",
    NT: "Northern Territory", ACT: "Australian Capital Territory",
  },
  "United States": {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
    CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  },
  Canada: {
    ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta",
    MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick",
    NL: "Newfoundland and Labrador", PE: "Prince Edward Island",
    YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
  },
  India: {
    MH: "Maharashtra", KA: "Karnataka", DL: "Delhi", TN: "Tamil Nadu",
    UP: "Uttar Pradesh", WB: "West Bengal", GJ: "Gujarat", RJ: "Rajasthan",
    AP: "Andhra Pradesh", TS: "Telangana", KL: "Kerala", MP: "Madhya Pradesh",
    PB: "Punjab", HR: "Haryana", BR: "Bihar", OR: "Odisha",
  },
  Denmark: {
    "84": "Region Hovedstaden", "82": "Region Midtjylland",
    "81": "Region Nordjylland", "83": "Region Sjælland",
    "85": "Region Syddanmark",
  },
};

const STATE_TO_COUNTRY: Record<string, string> = {
  "new south wales": "Australia", "victoria": "Australia", "queensland": "Australia",
  "western australia": "Australia", "south australia": "Australia", "tasmania": "Australia",
  "australian capital territory": "Australia", "northern territory": "Australia",
  "nsw": "Australia", "vic": "Australia", "qld": "Australia", "tas": "Australia", "act": "Australia",
  "ontario": "Canada", "quebec": "Canada", "british columbia": "Canada",
  "alberta": "Canada", "manitoba": "Canada", "saskatchewan": "Canada",
  "region midtjylland": "Denmark", "region hovedstaden": "Denmark",
  "region nordjylland": "Denmark", "region syddanmark": "Denmark", "region sjælland": "Denmark",
};

const CITY_TO_COUNTRY: Record<string, string> = {
  aarhus: "Denmark", copenhagen: "Denmark", "københavn": "Denmark",
  odense: "Denmark", aalborg: "Denmark", esbjerg: "Denmark",
};

// ── Dial codes ──

const DIAL_CODE: Record<string, string> = {
  Australia: "61", "New Zealand": "64", "United Kingdom": "44",
  Ireland: "353", Canada: "1", "United States": "1",
  India: "91", Nepal: "977", Bangladesh: "880", Pakistan: "92",
  "Sri Lanka": "94", Philippines: "63", Vietnam: "84", Malaysia: "60",
  Singapore: "65", Indonesia: "62", Thailand: "66", China: "86",
  Japan: "81", "South Korea": "82", Denmark: "45", Brazil: "55",
};

const TRUNK_ZERO = new Set<string>([
  "Australia", "New Zealand", "United Kingdom", "Ireland",
  "India", "Bangladesh", "Pakistan", "Sri Lanka", "Philippines",
  "Vietnam", "Malaysia", "Indonesia", "Thailand", "China", "Japan", "South Korea",
]);

// ── Helpers ──

function coerce(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.en === "string") return o.en;
    if (typeof o.name === "string") return o.name;
    if (typeof o.value === "string") return o.value;
  }
  return "";
}

function blank(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

function preserve<T>(next: T | null, existing: T | null | undefined): T | null {
  if (next != null && !(typeof next === "string" && (next as string).trim() === "")) return next;
  if (existing != null && !(typeof existing === "string" && (existing as string).trim() === "")) return existing as T;
  return null;
}

// ── Country ──

export function normalizeCountry(raw: unknown): string | null {
  const s = coerce(raw).trim();
  if (!s) return null;
  if (/^\d[\d\s-]{2,12}$/.test(s)) return null;
  const key = s.toUpperCase();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  const canonical = Object.values(COUNTRY_ALIASES).find(
    (v) => v.toLowerCase() === s.toLowerCase(),
  );
  return canonical || s;
}

function countryFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = String(email).toLowerCase().match(/@[^@]+\.([a-z]{2})(?:[.\s>]|$)/);
  return m && TLD_TO_COUNTRY[m[1]] ? TLD_TO_COUNTRY[m[1]] : null;
}

function countryFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  const m = String(website).toLowerCase().match(/\.([a-z]{2})(?:[/:?#]|$)/);
  return m && TLD_TO_COUNTRY[m[1]] ? TLD_TO_COUNTRY[m[1]] : null;
}

function countryFromState(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TO_COUNTRY[String(state).toLowerCase().trim()] || null;
}

// ── State ──

export function normalizeState(raw: unknown, country: string | null): string | null {
  const s = coerce(raw).trim();
  if (!s) return null;
  if (!country) return s;
  const table = STATE_BY_COUNTRY[country];
  if (!table) return s;
  const key = s.toUpperCase();
  if (table[key]) return table[key];
  const canonical = Object.values(table).find((v) => v.toLowerCase() === s.toLowerCase());
  return canonical || s;
}

// ── Phone ──

export function normalizePhone(raw: unknown, country: string | null): string | null {
  const s = coerce(raw).trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digitCount = s.replace(/\D/g, "").length;
    if (digitCount >= 8) return s;
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  if (!country) return s;
  const dial = DIAL_CODE[country];
  if (!dial) return s;
  if (digits.startsWith(dial)) {
    if (/[\s\-().]/.test(s)) return `+${s.trim()}`;
    return `+${dial} ${digits.slice(dial.length)}`.trim();
  }
  let local = digits;
  if (TRUNK_ZERO.has(country) && local.startsWith("0")) local = local.slice(1);
  if (!local) return s;
  return `+${dial} ${local}`;
}

// ── Email / website / postcode ──

export function normalizeEmail(raw: unknown): string | null {
  const s = coerce(raw).trim().toLowerCase();
  return s || null;
}

export function normalizeWebsite(raw: unknown): string | null {
  const s = coerce(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function normalizePostcode(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") return String(raw);
  const s = String(raw).trim();
  return s || null;
}

// ── Address splitting ──

export interface SplitAddressCtx {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  postcode?: string | null;
}

export interface SplitAddressResult {
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

const POSTCODE_RE = /^[A-Z0-9][A-Z0-9 \-]{2,9}$/i;

function looksLikePostcode(token: string): boolean {
  return POSTCODE_RE.test(token.trim()) && /\d/.test(token);
}

function cleanStateToken(token: string): string {
  return token.replace(/[\s\-–—:]+$/g, "").trim();
}

export function splitAddress(raw: unknown, ctx: SplitAddressCtx = {}): SplitAddressResult {
  const result: SplitAddressResult = {
    street: null,
    city: ctx.city || null,
    state: ctx.state || null,
    postcode: ctx.postcode || null,
    country: ctx.country || null,
  };
  const s = coerce(raw).trim();
  if (!s) return result;

  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    result.street = s;
    return result;
  }

  while (parts.length > 1) {
    const tail = parts[parts.length - 1];

    // Compact tail: "NSW - 2000 Australia"
    const compactTail = tail.match(/^(.+?)\s*[-–—,]?\s*(\d{3,10})\s+([A-Za-z][A-Za-z .'-]+)$/);
    if (compactTail) {
      const statePart = cleanStateToken(compactTail[1]);
      const pc = compactTail[2];
      const countryPart = compactTail[3].trim();
      const c = normalizeCountry(countryPart);
      const countryRecognized = c && (
        COUNTRY_ALIASES[countryPart.toUpperCase()] ||
        Object.values(COUNTRY_ALIASES).some((v) => v.toLowerCase() === countryPart.toLowerCase())
      );
      const country = countryRecognized ? c : (result.country || ctx.country || null);
      const expanded = normalizeState(statePart, country);
      const stateRecognized = !!country && !!STATE_BY_COUNTRY[country] && (
        STATE_BY_COUNTRY[country][statePart.toUpperCase()] ||
        Object.values(STATE_BY_COUNTRY[country]).some((v) => v.toLowerCase() === statePart.toLowerCase())
      );
      if (countryRecognized || stateRecognized) {
        if (countryRecognized && !result.country) result.country = c;
        if (!result.postcode) result.postcode = pc;
        if (expanded && stateRecognized && !result.state) result.state = expanded;
        parts.pop();
        continue;
      }
    }

    // Country?
    const c = normalizeCountry(tail);
    if (c && (COUNTRY_ALIASES[tail.toUpperCase()] ||
              Object.values(COUNTRY_ALIASES).some((v) => v.toLowerCase() === tail.toLowerCase()))) {
      if (!result.country) result.country = c;
      parts.pop();
      continue;
    }

    // Country + postcode: "Brazil 05061-150"
    const countryPostcode = tail.match(/^([A-Za-z][A-Za-z .'-]+)\s+([A-Z0-9][A-Z0-9\s-]{2,12})$/i);
    if (countryPostcode) {
      const countryName = countryPostcode[1].trim();
      const postcodeValue = countryPostcode[2].trim();
      const countryFromTail = normalizeCountry(countryName);
      const countryRecognized = countryFromTail && (
        COUNTRY_ALIASES[countryName.toUpperCase()] ||
        Object.values(COUNTRY_ALIASES).some((v) => v.toLowerCase() === countryName.toLowerCase())
      );
      if (countryRecognized && looksLikePostcode(postcodeValue)) {
        if (!result.country) result.country = countryFromTail;
        if (!result.postcode) result.postcode = postcodeValue;
        parts.pop();
        continue;
      }
    }

    // Postcode (possibly with state: "VIC 3000")
    const pcMatch = tail.match(/^(.*?)[\s,]+(\d{3,10})$/) || tail.match(/^(\d{3,10})$/);
    if (pcMatch) {
      if (pcMatch.length === 3) {
        const left = cleanStateToken(pcMatch[1]);
        const pc = pcMatch[2];
        if (!result.postcode) result.postcode = pc;
        const country = result.country || ctx.country || null;
        const expanded = normalizeState(left, country);
        if (expanded && country && STATE_BY_COUNTRY[country] &&
            (STATE_BY_COUNTRY[country][left.toUpperCase()] ||
             Object.values(STATE_BY_COUNTRY[country]).some((v) => v.toLowerCase() === left.toLowerCase()))) {
          if (!result.state) result.state = expanded;
        }
        parts.pop();
        continue;
      } else {
        if (!result.postcode) result.postcode = pcMatch[1];
        parts.pop();
        continue;
      }
    }

    // State?
    const country = result.country || ctx.country || null;
    if (country && STATE_BY_COUNTRY[country]) {
      const table = STATE_BY_COUNTRY[country];
      if (table[tail.toUpperCase()] ||
          Object.values(table).some((v) => v.toLowerCase() === tail.toLowerCase())) {
        if (!result.state) result.state = normalizeState(tail, country);
        parts.pop();
        continue;
      }
    }
    const inferred = STATE_TO_COUNTRY[tail.toLowerCase()];
    if (inferred) {
      if (!result.country) result.country = inferred;
      if (!result.state) result.state = normalizeState(tail, inferred);
      parts.pop();
      continue;
    }

    break;
  }

  // Next-to-last surviving part = city
  if (parts.length >= 2 && !result.city) {
    result.city = parts[parts.length - 1];
    parts.pop();
  }

  result.street = parts.join(", ") || null;
  return result;
}

// ── Orchestrator ──

export interface NormalizeLocationInput {
  country?: unknown; state?: unknown; city?: unknown;
  address?: unknown; postcode?: unknown; phone?: unknown;
  email?: unknown; website?: unknown;
  emailDomainHint?: string | null;
  websiteHint?: string | null;
  existing?: Partial<NormalizedLocation>;
}

export interface NormalizedLocation {
  country: string | null; state: string | null; city: string | null;
  address: string | null; postcode: string | null; phone: string | null;
  email: string | null; website: string | null;
}

export function normalizeLocation(input: NormalizeLocationInput): NormalizedLocation {
  const existing = input.existing || {};
  let country = normalizeCountry(input.country);
  if (!country) country = countryFromEmail(coerce(input.email) || input.emailDomainHint || "");
  if (!country) country = countryFromWebsite(coerce(input.website) || input.websiteHint || "");
  if (!country) country = countryFromState(coerce(input.state));
  if (!country) {
    const c = coerce(input.city).toLowerCase().trim();
    if (c && CITY_TO_COUNTRY[c]) country = CITY_TO_COUNTRY[c];
  }

  const split = splitAddress(input.address, {
    country, state: coerce(input.state) || null,
    city: coerce(input.city) || null,
    postcode: input.postcode != null ? normalizePostcode(input.postcode) : null,
  });
  if (!country && split.country) country = split.country;

  const stateRaw = coerce(input.state) || split.state || "";
  const state = normalizeState(stateRaw, country);
  const city = coerce(input.city) || split.city || null;
  let postcode = normalizePostcode(input.postcode);
  if (!postcode) postcode = split.postcode;

  return {
    country: preserve(country, existing.country ?? null),
    state: preserve(state, existing.state ?? null),
    city: preserve(city, existing.city ?? null),
    address: preserve(split.street, existing.address ?? null),
    postcode: preserve(postcode, existing.postcode ?? null),
    phone: preserve(normalizePhone(input.phone, country), existing.phone ?? null),
    email: preserve(normalizeEmail(input.email), existing.email ?? null),
    website: preserve(normalizeWebsite(input.website), existing.website ?? null),
  };
}

// ── Agent row normalizer ──

export interface AgentRowLike {
  name?: unknown; country?: unknown; state?: unknown; city?: unknown;
  address?: unknown; street1?: unknown; street2?: unknown;
  postcode?: unknown; phone?: unknown; email?: unknown; website?: unknown;
}

export interface NormalizedAgentRow {
  country: string | null; state: string | null; city: string | null;
  address: string | null; street1: string | null; street2: string | null;
  postcode: string | null; phone: string | null; email: string | null; website: string | null;
}

export function normalizeAgentRow(
  row: AgentRowLike,
  existing?: Partial<NormalizedAgentRow>,
): NormalizedAgentRow {
  const rawAddress = !blank(row.address)
    ? row.address
    : !blank(row.street1)
      ? `${coerce(row.street1)}${!blank(row.street2) ? ", " + coerce(row.street2) : ""}`
      : null;

  const loc = normalizeLocation({
    country: row.country, state: row.state, city: row.city,
    address: rawAddress, postcode: row.postcode, phone: row.phone,
    email: row.email, website: row.website,
    existing: existing ? {
      country: existing.country ?? null, state: existing.state ?? null,
      city: existing.city ?? null, address: existing.address ?? null,
      postcode: existing.postcode ?? null, phone: existing.phone ?? null,
      email: existing.email ?? null, website: existing.website ?? null,
    } : undefined,
  });

  const street2 = !blank(row.street2) ? coerce(row.street2).trim() : (existing?.street2 ?? null);

  return {
    country: loc.country, state: loc.state, city: loc.city,
    address: loc.address, street1: loc.address, street2,
    postcode: loc.postcode, phone: loc.phone, email: loc.email, website: loc.website,
  };
}

// ── Backfill diff ──

export type AgentBackfillPatch = Partial<
  Pick<NormalizedAgentRow, "country" | "state" | "city" | "address" | "street1" | "street2" | "postcode" | "phone">
>;

export function agentBackfillPatch(stored: AgentRowLike): AgentBackfillPatch {
  const n = normalizeAgentRow(stored);
  const patch: AgentBackfillPatch = {};
  const keys = ["country", "state", "city", "address", "street1", "street2", "postcode", "phone"] as const;
  for (const k of keys) {
    const before = (stored as Record<string, unknown>)[k];
    const after = n[k];
    const beforeStr = before == null ? null : String(before).trim() || null;
    if (after != null && after !== beforeStr) {
      (patch as Record<string, unknown>)[k] = after;
    }
  }
  return patch;
}

// ponytail: self-check
if (import.meta.url.endsWith("/agent-normalizers.ts") && process.argv[1]?.endsWith("agent-normalizers.ts")) {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
  assert(normalizeCountry("AUS") === "Australia", "country alias");
  assert(normalizeCountry("australia") === "Australia", "country case");
  assert(normalizeState("NSW", "Australia") === "New South Wales", "state expand");
  assert(normalizePhone("0412345678", "Australia") === "+61 412345678", "phone AU");
  assert(normalizeEmail("INFO@ACME.COM") === "info@acme.com", "email lowercase");
  assert(normalizeWebsite("acme.com") === "https://acme.com", "website prefix");
  const row = normalizeAgentRow({ country: "AUS", state: "NSW", phone: "0412345678", email: "a@b.com" });
  assert(row.country === "Australia", "agent row country");
  assert(row.state === "New South Wales", "agent row state");
  console.log("agent-normalizers: all checks passed");
}
