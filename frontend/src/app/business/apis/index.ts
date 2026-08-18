import { createApi } from "@/lib/api/create-api";
import { businessMockApi } from "./mock-data";
import { businessRealApi } from "./real-api";
import { placesMockApi } from "./places-mock-data";
import { placesRealApi } from "./places-real-api";

export const businessApi = createApi({ mock: businessMockApi, real: businessRealApi });
export const placesApi = createApi({ mock: placesMockApi, real: placesRealApi });
export type { BusinessType, BusinessProfile, BusinessProfilePatch, SelectOption, UpdateSubCategoryParams, PlaceDetails, PlaceSuggestion } from "./types";
