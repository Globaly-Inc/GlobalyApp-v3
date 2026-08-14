import { httpGet } from "@/lib/api/http";
import type { CountrySummary } from "./types";

type CountryDto = { id: number; name: string; iso2: string; region: string | null; city_count: string };

export const countriesRealApi = {
  getCountries: async (): Promise<CountrySummary[]> => {
    const { countries } = await httpGet<{ countries: CountryDto[] }>("/admin/platform/countries");
    return countries.map((c) => ({ id: c.id, name: c.name, iso2: c.iso2, region: c.region ?? "", cities: c.city_count }));
  },
};
