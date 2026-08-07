import { httpGet } from "@/lib/api/http";
import type { Country } from "./types";

type CountryDto = { id: number; name: string; iso2: string; phone_code: string | null };

let countriesPromise: Promise<Country[]> | null = null;

export const geoRealApi = {
  getCountries: (): Promise<Country[]> => {
    countriesPromise ??= httpGet<{ countries: CountryDto[] }>("/platform-users/countries")
      .then(({ countries }) => countries.map((c) => ({ id: c.id, name: c.name, iso2: c.iso2, phoneCode: c.phone_code })))
      .catch((err) => {
        countriesPromise = null;
        throw err;
      });
    return countriesPromise;
  },
};
