import type { City, Country } from "./types";

const COUNTRIES: Country[] = [
  { id: 1, name: "Australia", iso2: "AU", phoneCode: "+61" },
  { id: 2, name: "Bangladesh", iso2: "BD", phoneCode: "+880" },
  { id: 3, name: "Canada", iso2: "CA", phoneCode: "+1" },
  { id: 4, name: "China", iso2: "CN", phoneCode: "+86" },
  { id: 5, name: "Germany", iso2: "DE", phoneCode: "+49" },
  { id: 6, name: "India", iso2: "IN", phoneCode: "+91" },
  { id: 7, name: "Ireland", iso2: "IE", phoneCode: "+353" },
  { id: 8, name: "Japan", iso2: "JP", phoneCode: "+81" },
  { id: 9, name: "Malaysia", iso2: "MY", phoneCode: "+60" },
  { id: 10, name: "Nepal", iso2: "NP", phoneCode: "+977" },
  { id: 11, name: "Netherlands", iso2: "NL", phoneCode: "+31" },
  { id: 12, name: "New Zealand", iso2: "NZ", phoneCode: "+64" },
  { id: 13, name: "Nigeria", iso2: "NG", phoneCode: "+234" },
  { id: 14, name: "Pakistan", iso2: "PK", phoneCode: "+92" },
  { id: 15, name: "Philippines", iso2: "PH", phoneCode: "+63" },
  { id: 16, name: "Singapore", iso2: "SG", phoneCode: "+65" },
  { id: 17, name: "South Korea", iso2: "KR", phoneCode: "+82" },
  { id: 18, name: "Sri Lanka", iso2: "LK", phoneCode: "+94" },
  { id: 19, name: "United Arab Emirates", iso2: "AE", phoneCode: "+971" },
  { id: 20, name: "United Kingdom", iso2: "GB", phoneCode: "+44" },
  { id: 21, name: "United States", iso2: "US", phoneCode: "+1" },
  { id: 22, name: "Vietnam", iso2: "VN", phoneCode: "+84" },
];

const CITIES: Record<number, City[]> = {
  1: [
    { id: 101, name: "Sydney", stateName: "New South Wales" },
    { id: 102, name: "Melbourne", stateName: "Victoria" },
    { id: 103, name: "Brisbane", stateName: "Queensland" },
  ],
  3: [
    { id: 301, name: "Edmonton", stateName: "Alberta" },
    { id: 302, name: "Toronto", stateName: "Ontario" },
    { id: 303, name: "Vancouver", stateName: "British Columbia" },
  ],
};

export const geoMockApi = {
  getCountries: async (): Promise<Country[]> => COUNTRIES,
  getCities: async (countryId: number): Promise<City[]> => CITIES[countryId] ?? [],
};
