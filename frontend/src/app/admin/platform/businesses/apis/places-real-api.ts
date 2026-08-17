import { httpGet } from "@/lib/api/http";
import type { PlaceDetails, PlaceSuggestion } from "./types";

const BASE = "/admin/platform/places";

export const placesRealApi = {
  autocomplete: async (input: string, countryIso2?: string | null): Promise<PlaceSuggestion[]> => {
    const q = new URLSearchParams({ input });
    if (countryIso2) q.set("country", countryIso2);
    const { predictions } = await httpGet<{ predictions: PlaceSuggestion[] }>(`${BASE}/autocomplete?${q.toString()}`);
    return predictions;
  },
  getDetails: (placeId: string): Promise<PlaceDetails> => httpGet(`${BASE}/${placeId}/details`),
};
