import { createApi } from "@/lib/api/create-api";
import { extractedDataMockApi } from "./mock-data";
import { extractedDataRealApi } from "./real-api";

export const extractedDataApi = createApi({ mock: extractedDataMockApi, real: extractedDataRealApi });
export type { ExtractedInstitution } from "./types";
