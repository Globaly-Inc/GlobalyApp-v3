// Spreadsheet institution import — the browser parses the workbook and maps columns onto these
// system fields (frontend: admin/data/spreadsheet-import/const), so the server only ever receives
// rows already keyed by field, one institution per request.

import { z } from "zod";

const text = z.union([z.string(), z.number()]).nullish()
  .transform((v) => (v == null ? null : String(v).trim() || null));

/** Institution-level fields — the extraction's institution overview. */
export const SpreadsheetInstitutionSchema = z.object({
  name: z.string().trim().min(1, "Institution name is required").max(300),
  website: text, email: text, phone: text, address: text, city: text, state: text,
  country: text, zip_code: text, description: text, logo_url: text, ownership_type: text,
  facebook_url: text, instagram_url: text, twitter_url: text, linkedin_url: text, youtube_url: text,
});

/** One course row. Every key is a mappable system field; unmapped ones are simply absent. */
export const SpreadsheetCourseRowSchema = z.object({
  course_name: text,
  short_name: text, degree_level: text, subject_area: text, duration: text, study_mode: text,
  course_description: text, course_url: text, awarding_institution: text,
  /** Campus names the course is taught at, "," or ";" separated — created and linked. */
  branch_names: text,
  // fee_amount is the international tuition rate; domestic and application fees are their own lines.
  fee_name: text, fee_amount: text, fee_currency: text, fee_period: text, fee_installments: text,
  domestic_fee_amount: text,
  application_fee_name: text, application_fee_amount: text, application_fee_period: text, application_fee_installments: text,
  intake_months: text,
  min_degree_level: text, min_score: text, score_type: text,
  gre: text, gmat: text, sat_1: text, sat_2: text,
  ielts: text, toefl: text, pte: text, duolingo: text,
});

/** A template tab's rows (institution-import-template.xlsx). `courses` is the Course Names cell —
 * names separated by ";", blank = every course of the institution. */
const tab = <T extends z.ZodRawShape>(shape: T) =>
  z.array(z.object({ courses: text, ...shape })).max(10_000).default([]);

/** The multi-tab template's other tabs; the Eligibility tab is folded into course rows client-side. */
export const SpreadsheetExtrasSchema = z.object({
  branches: tab({ name: text, address: text, city: text, state: text, country: text, postcode: text, phone: text, email: text, map_link: text }),
  agents: tab({ name: text, email: text, phone: text, website: text, address: text, city: text, state: text, country: text, postcode: text }),
  fees: tab({ name: text, amount: text, period: text, installments: text, currency: text, student_type: text }),
  intakes: tab({ intake_month: text, intake_year: text, intake_name: text, start_date: text, end_date: text, orientation_date: text, admission_deadline: text }),
  scholarships: tab({ name: text, coverage_type: text, amount: text, currency: text, deadline: text, application_url: text, applicable_to: text, description: text }),
  study_units: tab({ unit_name: text, unit_code: text, unit_type: text, credit_points: text, description: text }),
  study_options: tab({ study_mode: text, study_load: text, duration_value: text, duration_unit: text }),
  accreditations: tab({ name: text, issuing_organization: text, website: text, description: text }),
});

export const SpreadsheetImportSchema = z.object({
  institution: SpreadsheetInstitutionSchema,
  rows: z.array(SpreadsheetCourseRowSchema).min(1).max(10_000),
  extras: SpreadsheetExtrasSchema.optional(),
});

export const SpreadsheetCheckNamesSchema = z.object({
  names: z.array(z.string().trim().min(1)).min(1).max(200),
});

export type SpreadsheetInstitution = z.infer<typeof SpreadsheetInstitutionSchema>;
export type SpreadsheetCourseRow = z.infer<typeof SpreadsheetCourseRowSchema>;
export type SpreadsheetImportInput = z.infer<typeof SpreadsheetImportSchema>;
export type SpreadsheetExtras = z.infer<typeof SpreadsheetExtrasSchema>;
