// Validation schemas for platform user profile management and sub-resources.

import { z } from "zod";
import { webUrl } from "../../../shared/url.js";
import { PERSONAL_SUB_CATEGORIES, GENDERS } from "../consts.js";
import { BUSINESS_TYPES } from "../../businesses/consts.js";

// ── Profile (full patch — used by PATCH /me) ──

export const ProfilePatchSchema = z.object({
  // Profile-level fields (platform_user_profiles table)
  individual_category: z.enum(PERSONAL_SUB_CATEGORIES).nullable(),
  nationality_id: z.number().int().positive().nullable(),
  country_of_residence_id: z.number().int().positive().nullable(),
  city_of_residence: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  date_of_birth: z.string().nullable(),
  gender: z.string().max(20).nullable(),
  degree_level: z.string().nullable(),
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
  preferred_destinations: z.array(z.number().int().positive()).max(5).nullable(), // up to 5 country IDs
  fields_of_study: z.array(z.object({ name: z.string().min(1) })).nullable(),
  preferred_degree_levels: z.array(z.string()).nullable(),
  expected_start_date: z.string().nullable(),
  personal_address_country_id: z.number().int().positive().nullable(),
  personal_address_city: z.string().nullable(),
  personal_address_state: z.string().nullable(),
  personal_address_street: z.string().nullable(),
  personal_address_postcode: z.string().nullable(),
  linkedin_url: webUrl().nullable(),
  website_url: webUrl().nullable(),
  onboarding_completed: z.boolean(),
}).partial().strict();

// ── Onboarding profile — fields set right after registration ──

// Personal accounts (student / parents / explorer) — includes individual_category
export const OnboardingPersonalSchema = z.object({
  individual_category: z.enum(PERSONAL_SUB_CATEGORIES),
  nationality_id: z.number().int().positive().nullable(),
  country_of_residence_id: z.number().int().positive(),
  city_of_residence: z.string().min(1),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  date_of_birth: z.string(),
  gender: z.enum(GENDERS),
  degree_level: z.string().min(1),
});

// Business accounts (agent / service_provider / etc.) — provisions a tenant DB
export const OnboardingBusinessSchema = z.object({
  subdomain: z.string().min(3).max(20).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase alphanumeric with hyphens"),
  business_name: z.string().min(1).max(200),
  business_type: z.enum(BUSINESS_TYPES).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  country_id: z.number().int().positive().optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  postcode: z.string().max(20).optional(),
});

// Institution accounts — no tenant DB
export const OnboardingInstitutionSchema = z.object({
  subdomain: z.string().min(3).max(20).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase alphanumeric with hyphens"),
  institution_name: z.string().min(1).max(200),
  institution_type: z.string().optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  country_id: z.number().int().positive().optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  postcode: z.string().max(20).optional(),
});

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

export const UpdateCategorySchema = z.object({ user_category: z.enum(["personal", "business"]) });

export const IdParamSchema = z.object({ id: z.string().uuid() });
export const CountryIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ProfilePatchInput = z.infer<typeof ProfilePatchSchema>;
export type OnboardingPersonalInput = z.infer<typeof OnboardingPersonalSchema>;
export type OnboardingBusinessInput = z.infer<typeof OnboardingBusinessSchema>;
export type OnboardingInstitutionInput = z.infer<typeof OnboardingInstitutionSchema>;
export type QualificationInput = z.infer<typeof QualificationSchema>;
export type LanguageTestInput = z.infer<typeof LanguageTestSchema>;
export type WorkExperienceInput = z.infer<typeof WorkExperienceSchema>;
