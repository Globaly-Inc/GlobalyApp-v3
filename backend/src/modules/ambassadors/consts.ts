// Ambassador constants. Values carried from the V1 edge functions
// (`create-ambassador-connect`, `ambassador-connect-onboarding`,
// `process-ambassador-payout`, `process-ambassador-timeout`,
// `send-ambassador-digest`) so behaviour matches the system being replaced.

export const PROGRAM_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const APPLICATION_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const AMBASSADOR_STATUSES = ["pending", "active", "inactive", "suspended"] as const;
export type AmbassadorStatus = (typeof AMBASSADOR_STATUSES)[number];

export const INQUIRY_STATUSES = [
  "pending",
  "matched",
  "accepted",
  "in_progress",
  "resolved",
  "escalated",
  "closed",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/** Statuses an ambassador may set on an inquiry assigned to them (V2 contract). */
export const AMBASSADOR_SETTABLE_STATUSES = ["accepted", "in_progress", "resolved"] as const;

export const EARNING_TYPES = ["inquiry_resolution", "referral", "bonus", "adjustment"] as const;
export type EarningType = (typeof EARNING_TYPES)[number];

export const EARNING_STATUSES = ["pending", "available", "withdrawn", "cancelled"] as const;
export type EarningStatus = (typeof EARNING_STATUSES)[number];

export const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

// ── Matching / timeout (V1 `process-ambassador-timeout`) ────────────────────

/** V1 gave a matched ambassador 5 minutes to accept before rerouting. */
export const INQUIRY_ACCEPT_WINDOW_MS = 5 * 60 * 1000;
/** V1 considered the 5 best-rated online candidates when rerouting. */
export const REROUTE_CANDIDATE_LIMIT = 5;
/** LavinMQ queue the timeout worker consumes. Messages are ticks, not payloads. */
export const TIMEOUT_QUEUE = "ambassador_timeout";
/** Cap on inquiries reprocessed per tick, so one run cannot hold the DB forever. */
export const TIMEOUT_BATCH_LIMIT = 200;

// ── Digest (V1 `send-ambassador-digest`) ────────────────────────────────────

export const DIGEST_QUEUE = "ambassador_digest";
/** V1 aggregated the last 7 days. */
export const DIGEST_WINDOW_DAYS = 7;
/** V1 listed the top 3 ambassadors by resolved count. */
export const DIGEST_TOP_AMBASSADORS = 3;

// ── Payouts (V1 `process-ambassador-payout`) ────────────────────────────────

/**
 * V1: `if (!amount || amount < 20) throw new Error("Minimum withdrawal is $20")`.
 * Expressed in minor units, because this database stores money as integers.
 */
export const MIN_PAYOUT_MINOR = 2000;

/**
 * Stable, replay-proof key for one payout request. Same shape as the enquiry
 * module's `unlockIdempotencyKey`: a caller that retries a timed-out request
 * with the same key gets the original payout back instead of a second transfer.
 */
export function payoutIdempotencyKey(ambassadorId: number, clientKey: string): string {
  return `ambassador_payout:${ambassadorId}:${clientKey}`;
}

/** Platform commission on an ambassador earning, in percent. V1 stored gross and
 *  net side by side and paid the net; it had no configurable rate, so this is the
 *  single rate that reproduces its numbers when net === gross.
 *  ponytail: move onto ambassador_programs.compensation_model when a program
 *  actually needs its own rate. */
export const PLATFORM_COMMISSION_PERCENT = 0;
