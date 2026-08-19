// Country and city lists for pickers on PUBLIC pages.
//
// Not @/app/geo/apis: that one reads /platform-users/countries, which requires a token.
// A logged-out visitor gets a 401, and lib/api/http's 401 handler hard-redirects to
// /auth/sign-in — so an authed picker on a public page doesn't degrade, it evicts the
// visitor from the page. These hit the unauthenticated geo routes instead.

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export type PublicCountry = { id: number; name: string; slug: string | null; iso2: string | null };
export type PublicCity = { id: number; name: string };

let countriesPromise: Promise<PublicCountry[]> | null = null;
const cityPromises = new Map<number, Promise<PublicCity[]>>();

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<T>;
}

export function getPublicCountries(): Promise<PublicCountry[]> {
  // A failed fetch clears the cache so a retry is not stuck on the rejection.
  countriesPromise ??= get<{ countries: PublicCountry[] }>("/countries")
    .then(({ countries }) => countries)
    .catch((err) => {
      countriesPromise = null;
      throw err;
    });
  return countriesPromise;
}

export function getPublicCities(countryId: number): Promise<PublicCity[]> {
  const cached = cityPromises.get(countryId);
  if (cached) return cached;
  const promise = get<{ cities: PublicCity[] }>(`/countries/${countryId}/cities`)
    .then(({ cities }) => cities)
    .catch((err) => {
      cityPromises.delete(countryId);
      throw err;
    });
  cityPromises.set(countryId, promise);
  return promise;
}
