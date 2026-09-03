import type {
  ActionPlanItem, ActionPlanResponse, ReadinessRow, ReadinessResponse, RankingRow, RankingsResponse,
  SeoStatus, Suggestion, SuggestionsResponse,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock mode represents a CONNECTED dashboard so frontend work can proceed without live GSC
// credentials — the real backend (GSC_KEY_FILE/GSC_SITE_URL unset today) reports not-connected
// and exercises the setup-instructions path instead.
const rankings: RankingRow[] = [
  {
    keyword: "study visa australia", position: 8.2, impressions: 4200, clicks: 310, ctr: 0.074, trend28d: 3.1,
    history: [
      { date: "2026-07-30", position: 11.3, impressions: 3800, clicks: 210, ctr: 0.055 },
      { date: "2026-08-13", position: 9.6, impressions: 4000, clicks: 260, ctr: 0.065 },
      { date: "2026-08-26", position: 8.2, impressions: 4200, clicks: 310, ctr: 0.074 },
    ],
  },
  {
    keyword: "student housing uk", position: 14.6, impressions: 1800, clicks: 40, ctr: 0.022, trend28d: -1.2,
    history: [
      { date: "2026-07-30", position: 13.4, impressions: 1600, clicks: 45, ctr: 0.028 },
      { date: "2026-08-26", position: 14.6, impressions: 1800, clicks: 40, ctr: 0.022 },
    ],
  },
  {
    keyword: "part time work visa canada", position: null, impressions: 0, clicks: 0, ctr: null, trend28d: null,
    history: [],
  },
];

const suggestions: Suggestion[] = [
  { keyword: "part time work visa canada", source: "gsc", impressions: 620, position: 13.4 },
  { keyword: "cheapest countries to study abroad", source: "ai" },
  { keyword: "student housing uk", source: "ai" },
];

const readiness: ReadinessRow[] = [
  {
    id: 1, title: "5 Things to Know Before Studying in Canada", slug: "5-things-before-studying-canada",
    hasFaqSection: true, hasFaqJsonLd: true, hasAnswerShapedIntro: true, hasMetaDescription: true, score: 100,
  },
  {
    id: 2, title: "UK Graduate Visa Route Explained", slug: "uk-graduate-visa-route-explained",
    hasFaqSection: false, hasFaqJsonLd: false, hasAnswerShapedIntro: true, hasMetaDescription: false, score: 25,
  },
];

const actionPlan: ActionPlanItem[] = [
  {
    priority: 1, action: "Add an FAQ block and internal link from the Canada post to target the position-14 query.",
    keyword: "student housing uk", blog_slug: "uk-graduate-visa-route-explained",
  },
  { priority: 2, action: "Add a meta description to improve click-through rate.", blog_slug: "uk-graduate-visa-route-explained" },
  { priority: 3, action: "Publish a new post targeting 'part time work visa canada' — real demand, not yet covered.", keyword: "part time work visa canada" },
];

export const seoMockApi = {
  getStatus: async (): Promise<SeoStatus> => {
    console.log("[mock] GET /admin/marketing/seo/status");
    await delay(150);
    return { connected: true };
  },
  getRankings: async (): Promise<RankingsResponse> => {
    console.log("[mock] GET /admin/marketing/seo/rankings");
    await delay(250);
    return { rows: rankings, stale: false, newestSnapshotAt: new Date().toISOString() };
  },
  getSuggestions: async (): Promise<SuggestionsResponse> => {
    console.log("[mock] GET /admin/marketing/seo/suggestions");
    await delay(250);
    return { suggestions };
  },
  getReadiness: async (): Promise<ReadinessResponse> => {
    console.log("[mock] GET /admin/marketing/seo/readiness");
    await delay(250);
    return { readiness };
  },
  generateActionPlan: async (): Promise<ActionPlanResponse> => {
    console.log("[mock] POST /admin/marketing/seo/action-plan");
    await delay(500);
    return { plan: actionPlan };
  },
};
