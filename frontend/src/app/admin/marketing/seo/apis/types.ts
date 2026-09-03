export type SeoStatus = { connected: boolean };

export type RankingHistoryPoint = {
  date: string;
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
};

export type RankingRow = {
  keyword: string;
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  trend28d: number | null; // positive = improved (position number went down)
  history: RankingHistoryPoint[];
};

export type RankingsResponse = { rows: RankingRow[]; stale: boolean; newestSnapshotAt: string | null };

export type SuggestionSource = "gsc" | "ai";

export type Suggestion = {
  keyword: string;
  source: SuggestionSource;
  impressions?: number;
  position?: number;
};

export type SuggestionsResponse = { suggestions: Suggestion[] };

export type ReadinessRow = {
  id: number;
  title: string;
  slug: string;
  hasFaqSection: boolean;
  hasFaqJsonLd: boolean;
  hasAnswerShapedIntro: boolean;
  hasMetaDescription: boolean;
  score: number;
};

export type ReadinessResponse = { readiness: ReadinessRow[] };

export type ActionPlanPriority = 1 | 2 | 3;

export type ActionPlanItem = {
  priority: ActionPlanPriority;
  action: string;
  keyword?: string;
  blog_slug?: string;
};

export type ActionPlanResponse = { plan: ActionPlanItem[] };
