import { createApi } from "@/lib/api/create-api";
import { businessesMockApi } from "./mock-data";
import { businessesRealApi } from "./real-api";

export const businessesApi = createApi({ mock: businessesMockApi, real: businessesRealApi });
export type { BusinessSummary } from "./types";
