import { createApi } from "@/lib/api/create-api";
import { featureFlagsMockApi } from "./mock-data";
import { featureFlagsRealApi } from "./real-api";

export const featureFlagsApi = createApi({ mock: featureFlagsMockApi, real: featureFlagsRealApi });
export type { FeatureFlag } from "./types";
