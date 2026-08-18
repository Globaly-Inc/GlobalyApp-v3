// Controlled vocabularies, taken from V1's src/lib/jobConstants.ts and V2's
// jobs / job_applications columns. Mirrored by CHECK constraints in
// 20260817_700 / 20260817_701 so a bad value cannot reach the table by any route.

export const JOB_STATUSES = ["draft", "open", "closed", "expired"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = ["internship", "casual", "part_time", "full_time", "contract"] as const;

export const APPLICATION_STAGES = [
  "new",
  "shortlisted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLY_METHODS = ["internal", "external"] as const;

/** V1's job-ai-assist accepted exactly these three. */
export const AI_ASSIST_TYPES = ["cover_letter", "optimize_post", "applicant_summary"] as const;
export type AiAssistType = (typeof AI_ASSIST_TYPES)[number];

/** V2's job_applications_resume_mime_whitelist, verbatim. */
export const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** V2's job_applications_resume_size_limit: 10 MiB. */
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
