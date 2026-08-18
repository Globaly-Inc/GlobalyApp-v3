// Zod schemas for pipeline step re-run endpoint.

import { z } from "zod";

// context_ingest is first on purpose: it parses the operator's supporting documents
// into a Job Context Bundle that every later step's prompt is then anchored to.
// V1 calls this "context-first ingestion" and runs it as its own function.
export const PIPELINE_STEPS = [
  "context_ingest",
  "institution", "branches", "agents", "discovery",
  "courses", "enrichment", "verification", "course_data",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const COURSE_DATA_TYPES = [
  "fees", "intakes", "units", "eligibility", "accreditations", "course",
] as const;

export type CourseDataType = (typeof COURSE_DATA_TYPES)[number];

export const RunStepSchema = z.object({
  step: z.enum(PIPELINE_STEPS),
  course_id: z.string().uuid().optional(),
  data_type: z.enum(COURSE_DATA_TYPES).optional(),
});

export type RunStepInput = z.infer<typeof RunStepSchema>;
