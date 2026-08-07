import { createApi } from "@/lib/api/create-api";
import { aiExtractionMockApi } from "./mock-data";
import { aiExtractionRealApi } from "./real-api";

export const aiExtractionApi = createApi({ mock: aiExtractionMockApi, real: aiExtractionRealApi });
export type { ExtractionProgress } from "./types";
