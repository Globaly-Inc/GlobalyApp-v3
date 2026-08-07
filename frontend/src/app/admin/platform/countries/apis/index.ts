import { createApi } from "@/lib/api/create-api";
import { countriesMockApi } from "./mock-data";
import { countriesRealApi } from "./real-api";

export const countriesApi = createApi({ mock: countriesMockApi, real: countriesRealApi });
export type { CountrySummary } from "./types";
