// Validation schemas for student registration, auth, and profile management.

import { z } from "zod";

// ── Auth ──

export const StudentRegisterSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  nationality_id: z.number().int().positive().optional(),
  country_of_residence_id: z.number().int().positive().optional(),
});

export const LoginRequestOtpSchema = z.object({
  email: z.string().email(),
});

export const LoginVerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ── Profile ──

export const StudentProfilePatchSchema = z.object({
  nationality_id: z.number().int().positive().nullable(),
  country_of_residence_id: z.number().int().positive().nullable(),
  date_of_birth: z.string().nullable(),
  gender: z.string().max(20).nullable(),
  highest_degree_level: z.string().nullable(),
  institution_attended: z.string().nullable(),
  gpa: z.number().min(0).max(10).nullable(),
  graduation_year: z.number().int().nullable(),
  english_test_type: z.string().nullable(),
  english_test_score: z.number().nullable(),
  english_test_date: z.string().nullable(),
  budget_min: z.number().int().nullable(),
  budget_max: z.number().int().nullable(),
  budget_currency: z.string().nullable(),
  include_living_expenses: z.boolean(),
  preferred_destinations: z.array(z.string()).nullable(),
  preferred_fields: z.array(z.string()).nullable(),
  preferred_degree_levels: z.array(z.string()).nullable(),
  expected_start_date: z.string().nullable(),
  individual_category: z.string().nullable(),
  personal_address_country_id: z.number().int().positive().nullable(),
  personal_address_city: z.string().nullable(),
  personal_address_state: z.string().nullable(),
  personal_address_street: z.string().nullable(),
  personal_address_postcode: z.string().nullable(),
  linkedin_url: z.string().url().nullable(),
  website_url: z.string().url().nullable(),
  onboarding_completed: z.boolean(),
}).partial().strict();

// ── Sub-resources ──

export const QualificationSchema = z.object({
  qualification_type: z.string().nullish(),
  degree_title: z.string().nullish(),
  subject_area: z.string().nullish(),
  institution_name: z.string().nullish(),
  grading_system: z.string().nullish(),
  grade_value: z.string().nullish(),
  is_current: z.boolean().optional(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  sort_order: z.number().int().optional(),
});

export const LanguageTestSchema = z.object({
  test_status: z.string().nullish(),
  test_type: z.string().nullish(),
  overall_score: z.string().nullish(),
  test_date: z.string().nullish(),
  sub_scores: z.record(z.unknown()).nullish(),
  sort_order: z.number().int().optional(),
});

export const WorkExperienceSchema = z.object({
  job_title: z.string().min(1),
  organization_name: z.string().nullish(),
  is_current: z.boolean().optional(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  sort_order: z.number().int().optional(),
});

export const IdParamSchema = z.object({ id: z.string().uuid() });

export type StudentRegisterInput = z.infer<typeof StudentRegisterSchema>;
export type LoginRequestOtpInput = z.infer<typeof LoginRequestOtpSchema>;
export type LoginVerifyOtpInput = z.infer<typeof LoginVerifyOtpSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type StudentProfilePatchInput = z.infer<typeof StudentProfilePatchSchema>;
export type QualificationInput = z.infer<typeof QualificationSchema>;
export type LanguageTestInput = z.infer<typeof LanguageTestSchema>;
export type WorkExperienceInput = z.infer<typeof WorkExperienceSchema>;
