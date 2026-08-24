// Zod schemas for staged entities and junction endpoints.

import { z } from "zod";

// ── Study options (SO1-SO3) ──
// .nullish() — the create form sends `null` for blank optional fields (e.g. duration_unit
// when no duration is set), not just omitting the key.
export const CreateStudyOptionSchema = z.object({
  job_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
  name: z.string().nullish(),
  study_mode: z.string().nullish(),
  study_load: z.string().nullish(),
  duration_value: z.number().int().nullish(),
  duration_unit: z.string().nullish(),
  applicable_to: z.string().nullish(),
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
// .nullish() — the tab sends `null` for blank date/month/year fields, not just omitting the key.
export const CreateIntakeSchema = z.object({
  job_id: z.string().uuid(),
  intake_name: z.string().nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  orientation_date: z.string().nullish(),
  admission_deadline: z.string().nullish(),
  intake_month: z.number().int().nullish(),
  intake_year: z.number().int().nullish(),
});

// ── Eligibility requirements (CE5-CE6) ──
// .nullish() — the form always sends one of min_score/min_score_percent as `null`
// (only one of the pair holds a value at a time), plus other blank optional fields.
export const CreateEligibilitySchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullish(),
  applicable_to: z.string().nullish(),
  min_degree_level: z.string().nullish(),
  degree_level_id: z.string().uuid().nullish(),
  score_type: z.string().nullish(),
  min_score: z.number().nullish(),
  min_score_percent: z.number().nullish(),
  description: z.string().nullish(),
  academic_tests: z.array(z.unknown()).optional(),
  language_tests: z.array(z.unknown()).optional(),
});

export const PatchEligibilitySchema = CreateEligibilitySchema.omit({ job_id: true }).partial();

// ── Study units (CE7-CE8) ──
// .nullish() — unit code/credit points/description are routinely left blank on create.
export const CreateStudyUnitSchema = z.object({
  job_id: z.string().uuid(),
  unit_name: z.string().min(1),
  unit_code: z.string().nullish(),
  credit_points: z.number().int().nullish(),
  description: z.string().nullish(),
  unit_type: z.string().optional(),
});

export const PatchStudyUnitSchema = CreateStudyUnitSchema.omit({ job_id: true }).partial();

// ── Staged accreditations (SA1-SA2) ──
// .nullish() — issuing_organization/website/description are frequently left blank.
export const CreateStagedAccreditationSchema = z.object({
  name: z.string().min(1),
  issuing_organization: z.string().nullish(),
  website: z.string().nullish(),
  description: z.string().nullish(),
});

// ── Global accreditation library (superadmin.accreditations) ──
export const LibraryAccreditationSchema = z.object({
  name: z.string().trim().min(1),
  issuing_organization: z.string().nullish(),
  website: z.string().nullish(),
  description: z.string().nullish(),
});

export const PatchLibraryAccreditationSchema = LibraryAccreditationSchema.partial();

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
// .nullish() (not .optional()) — the frontend sends `null` for cleared/never-extracted
// fields (empty string would overwrite real data with blanks), not just `undefined`.
export const CreateAgentSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullish(),
  country: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  postcode: z.string().nullish(),
});

export const CreateCampusSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  map_link: z.string().nullish(),
  postcode: z.string().nullish(),
  source_url: z.string().nullish(),
});
