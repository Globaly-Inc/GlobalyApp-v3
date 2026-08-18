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

// ── LMS delivery (Wave E4) ──────────────────────────────────────────────────

/**
 * V2's grade vocabulary (`gradeBody`, business-training.ts) plus the insert
 * default. V1's learner UI knew a DIFFERENT four (submitted/reviewed/approved/
 * rejected) and fell back to "awaiting review" on a miss, so every graded
 * submission displayed as ungraded for ever. One list, one CHECK constraint.
 */
export const SUBMISSION_STATUSES = ["submitted", "needs_revision", "passed", "failed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** The outcomes a reviewer may set. `submitted` is not one of them. */
export const GRADE_STATUSES = ["needs_revision", "passed", "failed"] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];

/**
 * V1's grading UI required at least 10 characters of feedback before it would
 * let a reviewer fail or return work — client-side only. V2 ported the route and
 * not the rule, leaving the server as the sole validator, validating nothing:
 * a learner could be failed with `feedback: null`. Enforced server-side now.
 */
export const MIN_FEEDBACK_CHARS_FOR_NEGATIVE_GRADE = 10;

export const APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INVITATION_STATUSES = ["pending", "accepted", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** V1 and V2 both used 30 days. */
export const INVITE_TTL_DAYS = 30;

/** V1's lms-course-invite capped a bulk request at 100 addresses. */
export const MAX_INVITE_EMAILS = 100;

/** Bytes of entropy in an invite token — V1's gen_random_bytes(32). V2 used a
 *  crypto.randomUUID(), which is 122 bits, not 256. */
export const INVITE_TOKEN_BYTES = 32;

/** Per-chapter quiz default, from lms2-ai's generated `minScore`. */
export const DEFAULT_QUIZ_PASSING_SCORE = 70;
