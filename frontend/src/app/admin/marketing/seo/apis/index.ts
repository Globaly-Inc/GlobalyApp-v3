import { createApi } from "@/lib/api/create-api";
import { seoMockApi } from "./mock-data";
import { seoRealApi } from "./real-api";

export const seoApi = createApi({ mock: seoMockApi, real: seoRealApi });
export type {
  ActionPlanItem, ActionPlanPriority, ActionPlanResponse, ReadinessResponse, ReadinessRow,
  RankingHistoryPoint, RankingRow, RankingsResponse, SeoStatus, Suggestion, SuggestionSource, SuggestionsResponse,
} from "./types";
