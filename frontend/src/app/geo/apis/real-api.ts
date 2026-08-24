import { httpGet } from "@/lib/api/http";
import type { City, Country } from "./types";

type CountryDto = {
  id: number;
  name: string;
  iso2: string;
  phone_code: string | null;
  currency: string | null;
  currency_symbol: string | null;
};
type CityDto = { id: number; name: string; state_name: string | null };

let countriesPromise: Promise<Country[]> | null = null;
// Cities are per-country and rarely change — cache each list after the first fetch.
const cityPromises = new Map<number, Promise<City[]>>();

export const geoRealApi = {
  getCountries: (): Promise<Country[]> => {
    countriesPromise ??= httpGet<{ countries: CountryDto[] }>("/platform-users/countries")
      .then(({ countries }) =>
        countries.map((c) => ({
          id: c.id,
          name: c.name,
          iso2: c.iso2,
          phoneCode: c.phone_code,
          currency: c.currency,
          currencySymbol: c.currency_symbol,
        })),
      )
      .catch((err) => {
        countriesPromise = null;
        throw err;
      });
    return countriesPromise;
  },

  getCities: (countryId: number): Promise<City[]> => {
    const cached = cityPromises.get(countryId);
    if (cached) return cached;
    const promise = httpGet<{ cities: CityDto[] }>(`/platform-users/countries/${countryId}/cities`)
      .then(({ cities }) => cities.map((c) => ({ id: c.id, name: c.name, stateName: c.state_name })))
      .catch((err) => {
        cityPromises.delete(countryId);
        throw err;
      });
    cityPromises.set(countryId, promise);
    return promise;
  },
};
