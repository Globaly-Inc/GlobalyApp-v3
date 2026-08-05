import { httpGet } from "@/lib/api/http";
import type { Country } from "./types";

type CountryDto = { id: number; name: string; iso2: string; phone_code: string | null };

export const geoRealApi = {
  getCountries: async (): Promise<Country[]> => {
    const data = await httpGet<CountryDto[]>("/geo/countries");
    return data.map((c) => ({ id: c.id, name: c.name, iso2: c.iso2, phoneCode: c.phone_code }));
  },
};
