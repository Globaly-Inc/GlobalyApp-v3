// Inbound webhook payload (V1's receive-institution-data contract).
//
// Validated at the boundary because the sender is another system: §1.6's "never
// trust external data". Every URL field goes through `webUrl()` — this payload
// becomes staged rows an admin later promotes into pages the public renders, so a
// `javascript:` "website" would be a stored-XSS hole with a long fuse.

import { z } from "zod";

import { webUrl } from "../../../shared/url.js";

const shortText = z.string().trim().min(1).max(300);
const longText = z.string().trim().max(20_000);

const InstitutionSchema = z.object({
  name: shortText,
  /**
   * REQUIRED, unlike V1, which required only `name`.
   *
   * V1 upserted the business by website and fell back to
   * `slugify(name) + Date.now().toString(36)` when there was none — so every retry
   * of a website-less payload created ANOTHER business row. That is not a style
   * difference, it is a non-idempotent write, and §3.4's staging contract needs a
   * natural key. The website is it.
   */
  website: webUrl(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(30).optional(),
  description: longText.optional(),
  logo_url: webUrl().optional(),
  facebook_url: webUrl().optional(),
  instagram_url: webUrl().optional(),
  linkedin_url: webUrl().optional(),
  twitter_url: webUrl().optional(),
  youtube_url: webUrl().optional(),
});

const CampusSchema = z.object({
  name: shortText,
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  map_link: webUrl().optional(),
});

const FeeItemSchema = z.object({
  fee_type: z.string().trim().max(60).optional(),
  // Fees are money: a string keeps the sender's exact decimal all the way into
  // `numeric`, where a JS number would already have rounded it.
  amount: z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)]),
});

const InstallmentSchema = z.object({
  items: z.array(FeeItemSchema).max(50).default([]),
});

const FeeSchema = z.object({
  name: z.string().trim().max(120).optional(),
  applicable_to: z.enum(["domestic", "international", "all", "both"]).optional(),
  period: z.string().trim().max(60).optional(),
  currency: z.string().trim().length(3).optional(),
  installments: z.array(InstallmentSchema).max(24).default([]),
});

const IntakeSchema = z.object({
  intake_name: z.string().trim().max(120).optional(),
  start_date: z.string().trim().max(40).optional(),
  end_date: z.string().trim().max(40).optional(),
  admission_deadline: z.string().trim().max(40).optional(),
  orientation_date: z.string().trim().max(40).optional(),
  intake_month: z.coerce.number().int().min(1).max(12).optional(),
  intake_year: z.coerce.number().int().min(1900).max(2200).optional(),
});

const EligibilitySchema = z.object({
  name: z.string().trim().max(200).optional(),
  applicable_to: z.enum(["domestic", "international", "all", "both"]).optional(),
  min_degree_level: z.string().trim().max(120).optional(),
  min_score_percent: z.coerce.number().min(0).max(100).optional(),
  min_score_grade: z.string().trim().max(40).optional(),
  description: longText.optional(),
  language_tests: z.array(z.unknown()).max(20).default([]),
  academic_tests: z.array(z.unknown()).max(20).default([]),
});

const AccreditationSchema = z.object({
  name: shortText,
  issuing_organization: z.string().trim().max(300).optional(),
  website: webUrl().optional(),
});

const CourseSchema = z.object({
  name: shortText,
  description: longText.optional(),
  degree_level: z.string().trim().max(120).optional(),
  study_mode: z.string().trim().max(60).optional(),
  subject_area: z.string().trim().max(200).optional(),
  duration_value: z.coerce.number().int().min(0).max(1000).optional(),
  duration_unit: z.enum(["days", "weeks", "months", "years"]).optional(),
  country: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  brochure_url: webUrl().optional(),
  image_url: webUrl().optional(),
  source_url: webUrl().optional(),
  fees: z.array(FeeSchema).max(50).default([]),
  intakes: z.array(IntakeSchema).max(100).default([]),
  eligibility: z.array(EligibilitySchema).max(50).default([]),
  accreditations: z.array(AccreditationSchema).max(50).default([]),
});

export const IngestInstitutionSchema = z.object({
  institution: InstitutionSchema,
  campuses: z.array(CampusSchema).max(200).default([]),
  // Bounded: an unbounded array from an unauthenticated-by-user source is a memory
  // and transaction-size problem waiting to happen.
  courses: z.array(CourseSchema).max(1000).default([]),
});

export const ExportQuerySchema = z.object({
  since: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(500).default(200),
});

export type IngestInstitutionInput = z.infer<typeof IngestInstitutionSchema>;
export type IngestCourseInput = z.infer<typeof CourseSchema>;
export type ExportQuery = z.infer<typeof ExportQuerySchema>;
