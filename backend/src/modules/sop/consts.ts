// SOP generator constants.

export const DOCUMENT_TYPES = ["university_sop", "visa_sop", "ucas_statement"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * The questionnaire (V1's "Zone B"). V1 kept the question set in its React client
 * and stored only the answers, keyed by `question_key`, so the keys are the contract
 * and the server is the only place that can say which are required before a draft.
 */
export const REQUIRED_QUESTION_KEYS = ["why_this_course", "career_plan", "home_ties"] as const;

/**
 * V1's `save_version` capped the history at ten and pruned the oldest version above
 * 1 to make room. Version 1 is never pruned: it is the baseline edit depth is
 * measured against.
 */
export const MAX_VERSIONS = 10;

/**
 * The formats this deployment can actually produce.
 *
 * V1's sop-documents accepted "pdf" | "docx" | "text" and then returned JSON for all
 * three — the browser did the rendering. There is no PDF or DOCX writer installed in
 * V3's backend and adding one silently is not this wave's call, so the server offers
 * the two it can genuinely serve and refuses the rest with a 400 rather than handing
 * back something mislabelled.
 */
export const EXPORT_FORMATS = ["text", "markdown"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Recorded on the audit log so a later provider swap stays traceable. */
export const LOG_ACTION_DRAFT = "stage1_draft";
