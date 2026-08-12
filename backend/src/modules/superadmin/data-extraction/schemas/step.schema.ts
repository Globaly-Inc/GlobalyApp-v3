// Zod schemas for pipeline step re-run endpoint.

import { z } from "zod";

export const PIPELINE_STEPS = [
  "institution", "branches", "agents", "discovery",
  "courses", "enrichment", "verification", "course_data",
  "accommodation", "insurance", "banking", "visa_services",
  "test_preparation", "career_services", "translation", "transport",
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
