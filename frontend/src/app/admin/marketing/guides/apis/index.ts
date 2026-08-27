import { createApi } from "@/lib/api/create-api";
import { guidesMockApi } from "./mock-data";
import { guidesRealApi } from "./real-api";

export const guidesApi = createApi({ mock: guidesMockApi, real: guidesRealApi });
export type { Guide, GuideFiles, GuideInput, GuideListParams, GuideWithLeadCount, Paginated } from "./types";
