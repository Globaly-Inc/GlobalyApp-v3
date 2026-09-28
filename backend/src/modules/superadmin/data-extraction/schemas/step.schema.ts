// Zod schemas for pipeline step re-run endpoint.

import { z } from "zod";

export const PIPELINE_STEPS = [
  // The one-step-at-a-time chain, in order (docs/data-extraction/2026-09-18-…-plan.md §3).
  "site_map", "site_snapshot", "site_analysis", "url_classify", "queue_pages",
  // Side steps and admin re-runs.
  "institution", "branches", "agents", "discovery",
  "courses", "enrichment", "verification", "course_data",
  "visa_services", "visa_service_data",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** What each chained step publishes when it finishes and the job is in auto mode. */
export const NEXT_STEP: Partial<Record<PipelineStep, PipelineStep>> = {
  site_map: "site_snapshot",
  site_snapshot: "site_analysis",
  site_analysis: "url_classify",
  url_classify: "queue_pages",
};

// Shared with queue.service.ts (resumeExtraction) and lib/queue-completion.ts
// (checkAllPagesDone's failed-discovery guard) — one list, so the two never disagree about which
// steps make up discovery.
export const DISCOVERY_STEP_ORDER: PipelineStep[] = ["site_map", "site_snapshot", "site_analysis", "url_classify", "queue_pages"];

export const STEP_MODES = ["auto", "manual"] as const;
export type StepMode = (typeof STEP_MODES)[number];

export const COURSE_DATA_TYPES = [
  "fees", "intakes", "units", "eligibility", "accreditations", "course",
] as const;

export type CourseDataType = (typeof COURSE_DATA_TYPES)[number];

export const RunStepSchema = z.object({
  step: z.enum(PIPELINE_STEPS),
  course_id: z.string().uuid().optional(),
  data_type: z.enum(COURSE_DATA_TYPES).optional(),
  visa_service_id: z.string().uuid().optional(),
  /** site_snapshot only: re-fetch every page even if a snapshot within the window exists. */
  fresh: z.boolean().optional(),
});

export type RunStepInput = z.infer<typeof RunStepSchema>;
