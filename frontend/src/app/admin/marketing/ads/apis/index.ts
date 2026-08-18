// Shipped page — the mock path is deleted per §1.4 ("each shipped page deletes
// its mock path"). createApi is not used here because there is no mock half left
// to choose between.
//
// This page replaced an AdminPlaceholderView with hardcoded ROWS and no api/ or
// store/ directory at all: §3.8 listed it as MOCK-ONLY, which read as "there is a
// mock to delete" when in fact the whole API layer had to be built.

import { adsRealApi } from "./real-api";

export const adsApi = adsRealApi;
export type {
  AdBudgetType,
  AdCampaign,
  AdCostModel,
  AdObjective,
  AdReport,
  AdStats,
  AdStatus,
  ListAdsParams,
} from "./types";
