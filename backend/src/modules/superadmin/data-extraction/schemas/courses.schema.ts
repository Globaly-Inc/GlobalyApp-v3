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

export const PatchCourseSchema = z
  .object({
    name: z.string(),
    short_name: z.string(),
    degree_level: z.string(),
    subject_area: z.string(),
    duration_weeks: z.number().int(),
    study_mode: z.string(),
    description: z.string(),
    domestic_fee_total: z.number(),
    domestic_currency: z.string(),
    international_fee_total: z.number(),
    international_currency: z.string(),
    awarding_institution: z.string(),
    career_paths: z.array(z.string()),
    source_url: z.string(),
  })
  .partial();

export const CourseAccreditationLinkSchema = z.object({
  job_id: z.string().uuid(),
  accreditation_id: z.string().uuid(),
});

export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
export type PatchCourseInput = z.infer<typeof PatchCourseSchema>;
