import { createApi } from "@/lib/api/create-api";
import { overviewMockApi } from "./mock-data";
import { overviewRealApi } from "./real-api";

export const overviewApi = createApi({ mock: overviewMockApi, real: overviewRealApi });
export type { DashboardData, DashboardPreset, FeatureUsage, GrowthPoint } from "./types";
