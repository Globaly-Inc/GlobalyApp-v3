// Zod schemas for staged entities and junction endpoints.

import { z } from "zod";
import { PARTIAL_DATE_RE, isValidPartialDate } from "../lib/partial-date.js";

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
  // The page's own fee wording — the label stays short, the detail lives here.
  description: z.string().nullable().optional(),
  student_type: z.string().optional(),
  period_type: z.string().optional(),
  currency: z.string().optional(),
  total_amount: z.number().optional(),
  installments: z.array(z.unknown()).optional(),
  save_for_reuse: z.boolean().optional(),
  // Link the fee to courses in the same request, so the form doesn't have to save first and
  // then go hunt for the course. Same trick as CreateStudyOptionSchema's course_id.
  course_ids: z.array(z.string().uuid()).optional(),
});

// course_ids is create-only — it is a junction write, not a column, so a PATCH carrying it
// would try to update a column that doesn't exist.
export const PatchCourseFeeSchema = CreateCourseFeeSchema.omit({ job_id: true, course_ids: true }).partial();

// ── Intakes (CE3-CE4) ──
// .nullish() — the tab sends `null` for blank date/month/year fields, not just omitting the key.
//
// Every date takes EITHER precision: "2026-09-21" when the institution published a day, "2026-09"
// when it published only a month. Validated rather than merely typed as a string, because the
// column now carries a CHECK constraint with the same pattern (migration 20260909_001) and a bad
// value should be a 400 naming the field, not a 500 out of Postgres.
//
// An empty string is coerced to null: a cleared <input type="date"> sends "", and storing that
// would violate the constraint.
const PartialDateSchema = z
  .union([
    z
      .string()
      .regex(PARTIAL_DATE_RE, "Use YYYY-MM-DD or YYYY-MM")
      // Shape is not enough: the regex and the column's CHECK both accept "2026-02-31", and the
      // `date` column that used to reject it is gone. Rejected rather than coerced here — an admin
      // who typed an impossible day should be told, not quietly given a different value.
      .refine(isValidPartialDate, "That date does not exist"),
    z.literal(""),
  ])
  .nullish()
  .transform((v) => (v === "" ? null : v));

/** An admin-named milestone: both halves required, since either alone means nothing. */
export const IntakeCustomDateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z
    .string()
    .regex(PARTIAL_DATE_RE, "Use YYYY-MM-DD or YYYY-MM")
    .refine(isValidPartialDate, "That date does not exist"),
});

export const CreateIntakeSchema = z.object({
  job_id: z.string().uuid(),
  intake_name: z.string().nullish(),
  start_date: PartialDateSchema,
  end_date: PartialDateSchema,
  orientation_date: PartialDateSchema,
  admission_deadline: PartialDateSchema,
  intake_month: z.number().int().min(1).max(12).nullish(),
  intake_year: z.number().int().nullish(),
  custom_dates: z.array(IntakeCustomDateSchema).nullish(),
});

// ── Eligibility requirements (CE5-CE6) ──
// .nullish() — the form always sends one of min_score/min_score_percent as `null`
// (only one of the pair holds a value at a time), plus other blank optional fields.
/**
 * The four values the column's CHECK constraint allows (migration 20260805_004).
 *
 * Enumerated rather than left as a free string so a bad value is a 400 naming the field instead of
 * a Postgres constraint violation surfacing as a 500.
 */
export const SCORE_TYPES = ["percentage", "gpa_4", "gpa_10", "cgpa"] as const;

/**
 * One academic admission test on a requirement.
 *
 * `test_name` is REQUIRED and non-empty, which is the whole point of validating this array: the
 * eligibility engine matches a stored test against the student's by name (`sameTest`), and a
 * nameless entry can never match anything. It does not fail — it emits a permanently `unknown`
 * criterion, which caps a real student's eligibility percentage below 100 forever and renders as a
 * tile labelled "Test". Same defect the English requirements had (see module CLAUDE.md (i)), and
 * the writers already drop nameless entries via normaliseAcademicTests; this closes the admin and
 * API path that bypassed them.
 *
 * Scores are strings because a page states "6.5" and "1200" alike, and because that is what
 * normaliseAcademicTests stores — a number here would compare unequal to the same value written
 * by a scrape.
 */
export const AcademicTestSchema = z.object({
  test_name: z.string().trim().min(1, "A test needs a name"),
  /** A stated minimum. This is the only field that gates a verdict. */
  score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  /** What admitted students scored. Displayed, never compared. */
  typical_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  is_optional: z.boolean().optional().default(false),
});

/** One accepted English test. `test_type_name` is required for exactly the reason above. */
export const LanguageTestSchema = z.object({
  test_type_name: z.string().trim().min(1, "A test needs a name"),
  overall_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  listening_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  reading_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  writing_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
  speaking_score: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
});

export const CreateEligibilitySchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().nullish(),
  applicable_to: z.string().nullish(),
  min_degree_level: z.string().nullish(),
  degree_level_id: z.string().uuid().nullish(),
  score_type: z.enum(SCORE_TYPES).nullish(),
  min_score: z.number().nullish(),
  min_score_percent: z.number().nullish(),
  description: z.string().nullish(),
  academic_tests: z.array(AcademicTestSchema).optional(),
  language_tests: z.array(LanguageTestSchema).optional(),
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
