import { createApi } from "@/lib/api/create-api";
import { aiMemoryMockApi } from "./mock-data";
import { aiMemoryRealApi } from "./real-api";

export const aiMemoryApi = createApi({ mock: aiMemoryMockApi, real: aiMemoryRealApi });
export type { SiteProfileSummary } from "./types";
