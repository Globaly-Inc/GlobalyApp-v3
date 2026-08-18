/**
 * Ad-campaign moderation types. Mirrors the backend's ownerCampaign serializer
 * (backend/src/modules/ads/services/serializers.ts).
 *
 * The cost-model and objective unions are EXACTLY V1's `validate_ad_campaign`
 * trigger: `cost_model IN ('cpv','cpl')`, `objective IN ('awareness','leads')`.
 * There is no `cpc` and no `flat` — a click is a lead with lead_type 'click',
 * which cpl bills.
 */

export type AdStatus = "draft" | "pending_review" | "active" | "paused" | "rejected" | "completed";
export type AdObjective = "awareness" | "leads";
export type AdCostModel = "cpv" | "cpl";
export type AdBudgetType = "daily" | "lifetime";

export type AdCampaign = {
  id: number;
  business_id: number;
  /** Joined from businesses — admin lists only. */
  business_name?: string | null;
  created_by: number | null;
  name: string;
  objective: AdObjective;
  status: AdStatus;
  budget_type: AdBudgetType;
  /** Numbers, not strings: the backend coerces `numeric` so the UI can format money. */
  budget_amount: number;
  spent_amount: number;
  cost_model: AdCostModel;
  cost_per_unit: number;
  starts_at: string | null;
  ends_at: string | null;
  target_audiences: string[];
  target_countries: string[];
  target_study_fields: string[];
  auto_pause_at_budget: boolean;
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  impressions_count: number;
  clicks_count: number;
  leads_count: number;
  created_at: string | null;
  updated_at: string | null;
};

/** One count per status, plus the pending-report badge V1's page showed. */
export type AdStats = Record<AdStatus, number> & {
  total: number;
  pending_reports: number;
};

export type AdReport = {
  id: number;
  campaign_id: number;
  creative_id: number | null;
  reporter_user_id: number;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  campaign_name: string | null;
  business_name: string | null;
};

export type ListAdsParams = {
  status?: AdStatus;
  business_id?: number;
  q?: string;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
