// Scribe constants. Every value is traced to V1's scribe-* edge functions or to
// V2's schema; nothing is invented.

/** V2 `scribe_sessions.status`, minus V1's dead-end. See SESSION STATUS below. */
export const SESSION_STATUSES = ["active", "ended", "reviewed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

// SESSION STATUS — deliberately three values, not V1's four.
//
// V1 had ('active','completing','completed','abandoned'). `scribe-review` set
// 'completing' and only `scribe-save` set 'completed', while the history list
// filtered `status = 'completed'` — so a counsellor who closed the tab on the
// review screen lost the session from history for ever even though its review was
// stored. 'abandoned' was in the CHECK constraint and nothing ever wrote it.
//
// V3: 'active' (recording), 'ended' (recording stopped — reviewable, and listed),
// 'reviewed' (counsellor approved the review). Ending and reviewing are separate
// explicit transitions, and every state is listed.

/** V1 `scribe_transcripts.speaker` CHECK — which V1 never actually applied. */
export const SPEAKERS = ["counselor", "student", "unknown"] as const;
export type Speaker = (typeof SPEAKERS)[number];

/** V1 scribe-review: `[{ task, owner: 'counselor'|'student', deadline? }]`. */
export const ACTION_ITEM_OWNERS = ["counselor", "student"] as const;

/** V1 scribe-review: `[{ concern, severity: 'low'|'medium'|'high' }]`. */
export const CONCERN_SEVERITIES = ["low", "medium", "high"] as const;

/** V1 scribe-coaching returned at most three. */
export const MAX_SUGGESTED_QUESTIONS = 3;

/**
 * Credits per AI action, on the business wallet through billing's ledger.
 *
 * V1 charged 1 for coaching (after the call — correct ordering, kept) and
 * charged NOTHING for review, which was the single most expensive call in the
 * feature: `scribe-review` picked gemini-2.5-pro over a whole session's
 * transcript at max_tokens 2000, unmetered and uncapped. That is defect
 * D-E3-2, not a pricing decision, so review is metered here at the same unit.
 */
export const COACHING_CREDITS = 1;
export const REVIEW_CREDITS = 1;
export const TRANSLATE_CREDITS = 1;

/** Ledger vocabulary — the type that already exists for AI spend. */
export const AI_TRANSACTION_TYPE = "ai_deduct" as const;
export const LEDGER_REFERENCE_TYPE = "scribe_session" as const;

/** Bounds on what reaches a prompt. V1 interpolated unbounded transcript text. */
export const MAX_PROMPT_TRANSCRIPT_CHARS = 60_000;
export const MAX_TRANSCRIPT_TEXT_CHARS = 8_000;
export const MAX_CHUNKS_PER_WRITE = 100;

/**
 * The consent wording is stored per row, verbatim, together with the version
 * that produced it — see the migration header. This is the current version; a
 * changed wording gets a new version and old rows keep theirs.
 */
export const CONSENT_VERSION = "2026-08-17.1";
