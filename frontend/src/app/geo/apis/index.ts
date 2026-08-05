import { createApi } from "@/lib/api/create-api";
import { geoMockApi } from "./mock-data";
import { geoRealApi } from "./real-api";

export const geoApi = createApi({ mock: geoMockApi, real: geoRealApi });
export type { Country } from "./types";
