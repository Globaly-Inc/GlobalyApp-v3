// Zod schemas for extraction courses endpoints.

import { z } from "zod";

export const CreateCourseSchema = z.object({
  name: z.string().min(1),
  source_url: z.string().optional(),
  degree_level: z.string().optional(),
  subject_area: z.string().optional(),
  duration_weeks: z.number().int().optional(),
  study_mode: z.string().optional(),
  description: z.string().optional(),
});

// Every optional column is nullable: clearing a field in the review UI has to be able
// to write NULL back, not just omit the key.
export const PatchCourseSchema = z
  .object({
    name: z.string(),
    short_name: z.string().nullable(),
    degree_level: z.string().nullable(),
    subject_area: z.string().nullable(),
    duration_weeks: z.number().int().nullable(),
    study_mode: z.string().nullable(),
    description: z.string().nullable(),
    domestic_fee_total: z.number().nullable(),
    domestic_currency: z.string().nullable(),
    international_fee_total: z.number().nullable(),
    international_currency: z.string().nullable(),
    awarding_institution: z.string().nullable(),
    career_paths: z.array(z.string()).nullable(),
    source_url: z.string().nullable(),
  })
  .partial();

export const BulkVerifyCoursesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  approve: z.boolean(),
});

export const CourseAccreditationLinkSchema = z.object({
  job_id: z.string().uuid(),
  accreditation_id: z.string().uuid(),
});

export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
export type PatchCourseInput = z.infer<typeof PatchCourseSchema>;
