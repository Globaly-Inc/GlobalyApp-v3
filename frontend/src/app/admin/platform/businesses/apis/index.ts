import { createApi } from "@/lib/api/create-api";
import { businessesMockApi } from "./mock-data";
import { businessesRealApi } from "./real-api";
import { placesMockApi } from "./places-mock-data";
import { placesRealApi } from "./places-real-api";

export const businessesApi = createApi({ mock: businessesMockApi, real: businessesRealApi });
export const placesApi = createApi({ mock: placesMockApi, real: placesRealApi });
export type * from "./types";
