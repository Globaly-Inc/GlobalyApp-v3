// Enquiry constants. Values carried from the V1 edge functions
// (`distribute-enquiry`, `unlock-enquiry`, `send-enquiry-digest`) so migrated
// rows and new rows price and behave the same way.

/** V1 `enquiry_status` enum, verbatim. Mirrored by the DB check constraint. */
export const ENQUIRY_STATUSES = [
  "pending",
  "viewed",
  "responded",
  "assigned",
  "converted",
  "closed",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const DISTRIBUTION_STATUSES = ["pending", "viewed", "responded", "closed"] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export const QUEUE_STATUSES = ["pending", "sent", "failed"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/**
 * Fan-out cap. V1 hard-coded 5 and never read `businesses.enquiry_max_distributions`
 * — that column sits on the *recipient*, so it cannot express a cap on how many
 * recipients one enquiry reaches, which is presumably why it stayed dead.
 * ponytail: move onto the enquiry (or a platform setting) if it ever needs to vary.
 */
export const MAX_DISTRIBUTIONS = 5;

/**
 * Hard radius for distance-based distribution, km. V1 banded 20/50 across three
 * tiers; V3 keeps 50 as the outer edge and 20 as the "nearby" preference used
 * only for ordering, because a tier that just re-sorts the same set is two
 * queries doing one query's work.
 */
export const DISTRIBUTION_RADIUS_KM = 50;
export const NEARBY_RADIUS_KM = 20;

/** V1 `businesses.enquiry_coin_cost` default, and V1's floor after discounting. */
export const DEFAULT_COIN_COST = 30;
export const MIN_COIN_COST = 10;

/** V1 trigger `validate_enquiry_rate_limit`: max 3 enquiries per student per 24h. */
export const ENQUIRY_RATE_LIMIT = 3;
export const ENQUIRY_RATE_WINDOW_HOURS = 24;

/** How much of the message a business sees before paying. */
export const MESSAGE_PREVIEW_CHARS = 140;

// ── Digest worker ───────────────────────────────────────────────────────────

/** LavinMQ queue the digest worker consumes. Messages are ticks, not payloads. */
export const DIGEST_QUEUE = "enquiry_digest";
/** V1 `send-enquiry-digest` read at most 500 pending rows per run. */
export const DIGEST_BATCH_LIMIT = 500;
/** V1 listed at most 10 leads in one email. */
export const DIGEST_MAX_LEADS_PER_EMAIL = 10;

/** `credit_transactions.reference_type` for an unlock. Matches V1's 'enquiry'. */
export const UNLOCK_REFERENCE_TYPE = "enquiry";

/** Stable, replay-proof key for the wallet debit behind one unlock. */
export function unlockIdempotencyKey(distributionId: number): string {
  return `enquiry_unlock:${distributionId}`;
}
