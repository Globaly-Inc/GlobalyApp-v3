import type { Destination } from "./destinations";

/**
 * Country the visitor is browsing from, ISO-2.
 *
 * ponytail: read from the browser's IANA timezone, not the IP. We serve behind our own nginx,
 * so there is no `cf-ipcountry` / `x-vercel-ip-country` header to read, and resolving geo on the
 * server would fork the `revalidate: 60` ISR cache into one entry per country. Timezone is plenty
 * to order eight cards, costs no request, and no ad-blocker eats it. `navigator.language` is the
 * cheaper read but tracks UI language — most phones in our origin markets ship `en-US`, which is
 * exactly the case we must not get wrong. Upgrade path: if we ever front the app with a CDN, read
 * its country header in middleware and pass the code in instead of this map.
 */
const COUNTRY_BY_TIMEZONE: Record<string, string> = {
  "Asia/Kathmandu": "NP",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dhaka": "BD",
  "Asia/Karachi": "PK",
  "Asia/Colombo": "LK",
  "Asia/Thimphu": "BT",
  "Asia/Kabul": "AF",
  "Asia/Manila": "PH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN",
  "Asia/Shanghai": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Seoul": "KR",
  "Asia/Tokyo": "JP",
  "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Bangkok": "TH",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Accra": "GH",
  "Africa/Cairo": "EG",
  "Africa/Johannesburg": "ZA",
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Indiana/Indianapolis": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Montreal": "CA",
  "America/Winnipeg": "CA",
  "America/Edmonton": "CA",
  "America/Vancouver": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Warsaw": "PL",
  "Europe/Moscow": "RU",
  "Pacific/Auckland": "NZ",
};

/**
 * Where students from each origin country actually go, most popular first — the card order for a
 * visitor from that country, after their own country. Plain content: edit the rows, add origins as
 * marketing asks. Unlisted origins keep the admin's `sort_order`.
 */
const DESTINATIONS_BY_ORIGIN: Record<string, string[]> = {
  US: ["GB", "IT", "ES", "IE", "FR", "AU", "DE", "CA", "JP"],
  CA: ["US", "GB", "AU", "FR", "IE", "DE", "NL", "IT"],
  GB: ["US", "AU", "CA", "IE", "ES", "FR", "DE", "NL"],
  IE: ["GB", "US", "AU", "CA", "ES", "FR", "DE", "NL"],
  AU: ["US", "GB", "CA", "NZ", "JP", "IE", "DE", "FR"],
  NZ: ["AU", "US", "GB", "CA", "JP", "IE", "DE", "NL"],
  NP: ["AU", "US", "JP", "CA", "GB", "KR", "IN", "DE"],
  IN: ["US", "CA", "GB", "AU", "DE", "IE", "NZ", "AE"],
  BD: ["US", "CA", "GB", "AU", "MY", "DE", "JP", "IN"],
  PK: ["GB", "US", "CA", "AU", "DE", "CN", "MY", "AE"],
  LK: ["AU", "GB", "US", "CA", "MY", "IN", "NZ", "DE"],
  BT: ["IN", "AU", "TH", "US", "GB", "CA", "JP", "NZ"],
  AF: ["IN", "TR", "US", "DE", "GB", "CA", "AU", "MY"],
  CN: ["US", "GB", "AU", "CA", "JP", "KR", "DE", "NZ"],
  KR: ["US", "JP", "AU", "CN", "GB", "CA", "DE", "NZ"],
  JP: ["US", "AU", "CA", "GB", "KR", "DE", "FR", "NZ"],
  VN: ["JP", "KR", "US", "AU", "CA", "GB", "DE", "TW"],
  PH: ["US", "AU", "CA", "GB", "JP", "KR", "NZ", "DE"],
  ID: ["AU", "MY", "US", "GB", "JP", "DE", "NL", "CN"],
  MY: ["AU", "GB", "US", "JP", "NZ", "CA", "IE", "DE"],
  TH: ["US", "AU", "GB", "JP", "CN", "DE", "CA", "NZ"],
  NG: ["GB", "US", "CA", "DE", "AU", "MY", "IE", "ZA"],
  KE: ["US", "GB", "CA", "AU", "IN", "DE", "ZA", "MY"],
  GH: ["GB", "US", "CA", "DE", "AU", "MY", "ZA", "IE"],
  ZA: ["GB", "US", "AU", "DE", "CA", "NL", "IE", "NZ"],
  EG: ["DE", "GB", "US", "IT", "FR", "CA", "AE", "AU"],
  AE: ["GB", "US", "CA", "AU", "IN", "DE", "IE", "MY"],
  SA: ["US", "GB", "CA", "AU", "DE", "AE", "IE", "MY"],
  QA: ["GB", "US", "CA", "AU", "DE", "AE", "IE", "MY"],
  DE: ["AT", "NL", "GB", "US", "ES", "FR", "IT", "CA"],
  FR: ["GB", "ES", "CA", "US", "DE", "IT", "IE", "NL"],
  ES: ["IT", "GB", "DE", "FR", "US", "IE", "NL", "PT"],
  IT: ["ES", "GB", "DE", "FR", "US", "NL", "IE", "AT"],
  NL: ["GB", "DE", "ES", "US", "IT", "FR", "SE", "CA"],
  BR: ["PT", "US", "ES", "FR", "DE", "GB", "CA", "IT"],
  MX: ["US", "ES", "CA", "FR", "DE", "GB", "IT", "NL"],
  RU: ["DE", "CZ", "GB", "US", "FR", "IT", "CN", "CA"],
};

/** Where a destination sits for a visitor from `home`: own country first, then the popular list. */
export function rankFor(home: string) {
  const popular = DESTINATIONS_BY_ORIGIN[home] ?? [];
  return (dest: Destination) => {
    const code = dest.code?.toUpperCase();
    if (!code) return popular.length + 1;
    if (code === home) return -1;
    const i = popular.indexOf(code);
    return i === -1 ? popular.length : i;
  };
}

function visitorCountry(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return COUNTRY_BY_TIMEZONE[tz] ?? null;
  } catch {
    return null;
  }
}

/**
 * Reorder the featured countries for whoever is looking: their own country first, then the
 * destinations students from there most often pick. Unknown timezone → list comes back untouched.
 * Sort the full list before slicing, or the visitor's country never survives into the top eight.
 */
export function orderDestinationsForVisitor(destinations: Destination[]): Destination[] {
  const home = visitorCountry();
  if (!home) return destinations;
  const rank = rankFor(home);
  // Array#sort is stable, so equally-ranked countries keep the admin's `sort_order`.
  return [...destinations].sort((a, b) => rank(a) - rank(b));
}
