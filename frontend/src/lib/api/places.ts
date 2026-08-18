import { createApi } from "./create-api";
import { httpGet } from "./http";

export type PlaceSuggestion = { placeId: string; description: string };
export type PlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postcode: string | null;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE = "/places";

const placesRealApi = {
  autocomplete: async (input: string, countryIso2?: string | null): Promise<PlaceSuggestion[]> => {
    const q = new URLSearchParams({ input });
    if (countryIso2) q.set("country", countryIso2);
    const { predictions } = await httpGet<{ predictions: PlaceSuggestion[] }>(`${BASE}/autocomplete?${q.toString()}`);
    return predictions;
  },
  getDetails: (placeId: string): Promise<PlaceDetails> => httpGet(`${BASE}/${placeId}/details`),
};

const MOCK_SUGGESTIONS: PlaceSuggestion[] = [
  { placeId: "mock-1", description: "1 George St, Sydney NSW, Australia" },
  { placeId: "mock-2", description: "200 George St, Sydney NSW, Australia" },
  { placeId: "mock-3", description: "1 Queen St, Auckland, New Zealand" },
];

const MOCK_DETAILS: Record<string, PlaceDetails> = {
  "mock-1": { address: "1 George St, Sydney NSW 2000, Australia", latitude: -33.8612, longitude: 151.2093, city: "Sydney", state: "New South Wales", postcode: "2000" },
  "mock-2": { address: "200 George St, Sydney NSW 2000, Australia", latitude: -33.8628, longitude: 151.2085, city: "Sydney", state: "New South Wales", postcode: "2000" },
  "mock-3": { address: "1 Queen St, Auckland 1010, New Zealand", latitude: -36.8443, longitude: 174.7645, city: "Auckland", state: "Auckland", postcode: "1010" },
};

const placesMockApi = {
  autocomplete: async (input: string): Promise<PlaceSuggestion[]> => {
    console.log("[mock] GET /places/autocomplete", input);
    await delay(200);
    if (!input.trim()) return [];
    return MOCK_SUGGESTIONS.filter((s) => s.description.toLowerCase().includes(input.toLowerCase()));
  },
  getDetails: async (placeId: string): Promise<PlaceDetails> => {
    console.log("[mock] GET /places/:placeId/details", placeId);
    await delay(150);
    const details = MOCK_DETAILS[placeId];
    if (!details) throw new Error("Place not found");
    return details;
  },
};

export const placesApi = createApi({ mock: placesMockApi, real: placesRealApi });
