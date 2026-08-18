// Ad constants. Values carried from V1 (`record-ad-impression`, `record-ad-lead`,
// AdminAds.tsx) so migrated rows and new rows price and behave the same way.
// Every list here is mirrored by a CHECK constraint in 20260817_800/801.

export const AD_OBJECTIVES = ["awareness", "traffic", "leads", "engagement"] as const;
export type AdObjective = (typeof AD_OBJECTIVES)[number];

export const AD_STATUSES = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
  "completed",
] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/**
 * Statuses an advertiser may set on its own campaign.
 *
 * `active` is deliberately absent: V1's AdminAds page was the only thing that
 * ever wrote it, and letting the advertiser write it turns moderation into a
 * suggestion. `rejected` and `completed` are likewise the platform's to assign.
 */
export const ADVERTISER_SETTABLE_STATUSES: readonly AdStatus[] = ["draft", "pending_review", "paused"];

export const AD_BUDGET_TYPES = ["daily", "lifetime"] as const;
export type AdBudgetType = (typeof AD_BUDGET_TYPES)[number];

export const AD_COST_MODELS = ["cpv", "cpl", "cpc", "flat"] as const;
export type AdCostModel = (typeof AD_COST_MODELS)[number];

export const AD_MEDIA_TYPES = ["image", "video"] as const;
export const AD_LEAD_TYPES = ["click", "enquiry", "rsvp"] as const;
export type AdLeadType = (typeof AD_LEAD_TYPES)[number];

export const AD_REPORT_REASONS = ["inappropriate", "misleading", "spam", "offensive", "other"] as const;
export const AD_REPORT_STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;

/** V2's serve endpoint returned at most two ads per placement. */
export const ADS_PER_PLACEMENT = 2;

/** V1: 1 impression per viewer+campaign+placement per hour. */
export const IMPRESSION_DEDUP_HOURS = 1;
/** V1: 1 lead per user+campaign+lead_type per 24 hours. */
export const LEAD_DEDUP_HOURS = 24;

/** V1: every 1,000th impression bills the advertiser's wallet. */
export const IMPRESSION_BLOCK_SIZE = 1000;
export const IMPRESSION_BLOCK_CREDITS = 50;

/** `credit_transactions.reference_type` for ad spend. Matches V1's 'ad_campaign'. */
export const AD_REFERENCE_TYPE = "ad_campaign";

/**
 * Stable, replay-proof key for the wallet debit behind one 1,000-impression block.
 * The block number — not a timestamp and not the impression id — is what makes it
 * idempotent: re-running the biller for block N can never charge twice.
 */
export function impressionBlockIdempotencyKey(campaignId: number, block: number): string {
  return `ad_impression_block:${campaignId}:${block}`;
}

export const CAMPAIGN_PAUSED_NOTIFICATION_TYPE = "ad_campaign_paused";
