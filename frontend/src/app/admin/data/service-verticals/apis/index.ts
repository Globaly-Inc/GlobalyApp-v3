import { createApi } from "@/lib/api/create-api";
import { serviceVerticalsMockApi } from "./mock-data";
import { serviceVerticalsRealApi } from "./real-api";

export const serviceVerticalsApi = createApi({
  mock: serviceVerticalsMockApi,
  real: serviceVerticalsRealApi,
});

export type {
  PromoteResult,
  VerticalCounts,
  VerticalReviewStatus,
  VerticalRow,
  VerticalRowsResponse,
  VerticalSlug,
  VerticalSummary,
} from "./types";
