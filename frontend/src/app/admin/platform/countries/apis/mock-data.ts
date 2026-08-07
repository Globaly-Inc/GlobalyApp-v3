import type { CountrySummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockCountries: CountrySummary[] = [
  { id: 1, name: "Australia", iso2: "AU", region: "Oceania", cities: "142" },
  { id: 2, name: "United Kingdom", iso2: "GB", region: "Europe", cities: "98" },
  { id: 3, name: "Canada", iso2: "CA", region: "Americas", cities: "76" },
  { id: 4, name: "Nepal", iso2: "NP", region: "Asia", cities: "23" },
];

export const countriesMockApi = {
  getCountries: async (): Promise<CountrySummary[]> => {
    console.log("[mock] GET /admin/countries");
    await delay(300);
    return mockCountries;
  },
};
