// Training constants. Every value here is taken from the V2 contract
// (routes/training.ts, routes/business-training.ts) — nothing is invented.

export const TARGET_AUDIENCES = ["agents", "ambassadors", "students"] as const;
export type TargetAudience = (typeof TARGET_AUDIENCES)[number];

export const CERTIFICATE_LEVELS = ["completion", "bronze", "silver", "gold"] as const;
export type CertificateLevel = (typeof CERTIFICATE_LEVELS)[number];

export const PROGRESS_STATUSES = ["in_progress", "completed"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

/** V2 `XP_BY_LEVEL`, verbatim. `completion` was absent there and fell through
 *  to the `?? 25` default, so it is written out here rather than left implicit. */
export const XP_BY_LEVEL: Record<CertificateLevel, number> = {
  gold: 50,
  silver: 35,
  bronze: 25,
  completion: 25,
};

/** V2's fallback when a program has no certificate_level_thresholds. */
export const DEFAULT_LEVEL_THRESHOLDS = { gold: 95, silver: 85, bronze: 70 } as const;

/** V2: `attemptCount >= (program.max_attempts ?? 3)`. */
export const DEFAULT_MAX_ATTEMPTS = 3;
/** V2: `score >= (program.passing_score ?? 70)`. */
export const DEFAULT_PASSING_SCORE = 70;

/** V2 awarded a 20 XP bonus on every 7th consecutive day. */
export const STREAK_BONUS_XP = 20;
export const STREAK_BONUS_EVERY_DAYS = 7;

/** The one badge V2 actually granted. Do not add more without a source. */
export const FIRST_COURSE_BADGE = { id: "first_course", name: "First Course Complete" } as const;

/** V2 rounded certificate expiry to 30-day months. Kept so a migrated
 *  certificate expires on the same day it would have under V1/V2. */
export const EXPIRY_DAYS_PER_MONTH = 30;

/** Prefix on the public verification identifier, so a support agent can tell at
 *  a glance what a pasted code is. */
export const VERIFICATION_CODE_PREFIX = "GC";
