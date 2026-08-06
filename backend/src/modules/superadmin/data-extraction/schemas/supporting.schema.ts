// Zod schemas for supporting endpoints (site profiles, lessons, save-and-learn).

import { z } from "zod";

export const UpsertSiteProfileSchema = z.object({
  domain: z.string().min(1),
  canonical_institution_name: z.string().optional(),
  canonical_legal_name: z.string().optional(),
  fee_format_hint: z.string().optional(),
  intake_format_hint: z.string().optional(),
  notes: z.string().optional(),
});

export const SiteProfileQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const PatchLessonSchema = z.object({
  is_active: z.boolean(),
});

export const LessonsQuerySchema = z.object({
  domain: z.string().optional(),
  step: z.string().optional(),
  scope: z.string().optional(),
  active_only: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const SAVE_AND_LEARN_TABLES = [
  "extraction_courses",
  "extraction_institution_overview",
  "extraction_campuses",
  "extraction_agents",
  "extraction_intakes",
  "extraction_course_fees",
  "extraction_eligibility_requirements",
  "extraction_study_units",
  "extraction_accreditations",
] as const;

export const SaveAndLearnSchema = z.object({
  table: z.enum(SAVE_AND_LEARN_TABLES),
  id: z.string().uuid(),
  patch: z.record(z.unknown()),
  job_id: z.string().uuid().optional(),
  source_url: z.string().optional(),
});

export type SaveAndLearnInput = z.infer<typeof SaveAndLearnSchema>;
