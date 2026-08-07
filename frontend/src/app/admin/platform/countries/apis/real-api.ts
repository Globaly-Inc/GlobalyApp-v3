import { httpGet } from "@/lib/api/http";
import type { CountrySummary } from "./types";

export const countriesRealApi = {
  getCountries: (): Promise<CountrySummary[]> => httpGet("/admin/countries"),
};
