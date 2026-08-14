// Zod schemas for staged entities and junction endpoints.

import { z } from "zod";

// ── Study options (SO1-SO3) ──
export const CreateStudyOptionSchema = z.object({
  job_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
  name: z.string().optional(),
  study_mode: z.string().optional(),
  study_load: z.string().optional(),
  duration_value: z.number().int().optional(),
  duration_unit: z.string().optional(),
  applicable_to: z.string().optional(),
  save_for_reuse: z.boolean().optional(),
});

export const PatchStudyOptionSchema = z
  .object({
    name: z.string(),
    study_mode: z.string(),
    study_load: z.string(),
    duration_value: z.number().int(),
    duration_unit: z.string(),
    applicable_to: z.string(),
    save_for_reuse: z.boolean(),
  })
  .partial();

// ── Course fees (CE1-CE2) ──
export const CreateCourseFeeSchema = z.object({
  job_id: z.string().uuid(),
  // nullable so an edit can clear the name, not just omit it
  name: z.string().nullable().optional(),
  student_type: z.string().optional(),
  period_type: z.string().optional(),
  currency: z.string().optional(),
  total_amount: z.number().optional(),
  installments: z.array(z.unknown()).optional(),
  save_for_reuse: z.boolean().optional(),
});

export const PatchCourseFeeSchema = CreateCourseFeeSchema.omit({ job_id: true }).partial();

// ── Intakes (CE3-CE4) ──
export const CreateIntakeSchema = z.object({
  job_id: z.string().uuid(),
  intake_name: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  orientation_date: z.string().optional(),
  admission_deadline: z.string().optional(),
  intake_month: z.number().int().optional(),
  intake_year: z.number().int().optional(),
});

// ── Eligibility requirements (CE5-CE6) ──
export const CreateEligibilitySchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().optional(),
  applicable_to: z.string().optional(),
  min_degree_level: z.string().optional(),
  degree_level_id: z.string().uuid().optional(),
  score_type: z.string().optional(),
  min_score: z.number().optional(),
  min_score_percent: z.number().optional(),
  description: z.string().optional(),
  academic_tests: z.array(z.unknown()).optional(),
  language_tests: z.array(z.unknown()).optional(),
});

export const PatchEligibilitySchema = CreateEligibilitySchema.omit({ job_id: true }).partial();

// ── Study units (CE7-CE8) ──
export const CreateStudyUnitSchema = z.object({
  job_id: z.string().uuid(),
  unit_name: z.string().min(1),
  unit_code: z.string().optional(),
  credit_points: z.number().int().optional(),
  description: z.string().optional(),
  unit_type: z.string().optional(),
});

export const PatchStudyUnitSchema = CreateStudyUnitSchema.omit({ job_id: true }).partial();

// ── Staged accreditations (SA1-SA2) ──
export const CreateStagedAccreditationSchema = z.object({
  name: z.string().min(1),
  issuing_organization: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
});

// ── Junctions (J1-J2) ──
export const JUNCTION_SLUGS = [
  "study-options",
  "course-fees",
  "intakes",
  "eligibility-requirements",
  "study-units",
  "accreditations",
  "campuses",
] as const;

export const JunctionParamSchema = z.object({
  junction: z.enum(JUNCTION_SLUGS),
});

export const JunctionBodySchema = z.object({
  job_id: z.string().uuid(),
  course_id: z.string().uuid(),
  entity_id: z.string().uuid(),
});

// ── Accreditation mappings (J3) ──
export const AccreditationMappingSchema = z.object({
  job_id: z.string().uuid(),
  extraction_accreditation_ids: z.array(z.string().uuid()),
  accreditation_id: z.string().uuid().nullable(),
});

// ── Agents/campuses CRUD (AC1-AC4) ──
export const CreateAgentSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
});

export const CreateCampusSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  map_link: z.string().optional(),
  postcode: z.string().optional(),
  source_url: z.string().optional(),
});
