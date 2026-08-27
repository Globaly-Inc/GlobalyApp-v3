import { httpGet, httpPost } from "@/lib/api/http";
import type {
  ActionPlanResponse, RankingsResponse, ReadinessResponse, SeoStatus, SuggestionsResponse,
} from "./types";

const BASE = "/admin/marketing/seo";

export const seoRealApi = {
  getStatus: (): Promise<SeoStatus> => httpGet(`${BASE}/status`),
  getRankings: (): Promise<RankingsResponse> => httpGet(`${BASE}/rankings`),
  getSuggestions: (): Promise<SuggestionsResponse> => httpGet(`${BASE}/suggestions`),
  getReadiness: (): Promise<ReadinessResponse> => httpGet(`${BASE}/readiness`),
  generateActionPlan: (): Promise<ActionPlanResponse> => httpPost(`${BASE}/action-plan`, {}),
};
