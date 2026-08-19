// Validation schemas for scholarship management (admin-managed content, same pattern
// as categories/countries — no business ownership, no eligibility/service sub-tables).

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SlugParamSchema = z.object({ slug: z.string().trim().min(1) });

export const SourceTypeSchema = z.enum(["university", "independent", "government", "foundation", "other"]);
export const BasisSchema = z.enum(["merit", "need", "sports", "diversity", "government", "research", "other"]);
export const CoverageTypeSchema = z.enum([
  "full_tuition", "partial_tuition", "stipend", "living_allowance", "various", "other",
]);

const slug = z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens");

// z.coerce.boolean() coerces via JS `Boolean(value)`, so the *string* "false" — exactly
// what a query param carries — comes out `true`. Only "true"/"false" text is accepted here.
const booleanQueryParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const ScholarshipInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug,
  description: z.string().nullable().optional(),
  provider_name: z.string().max(300).nullable().optional(),
  source_type: SourceTypeSchema.default("university"),
  country: z.string().max(200).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  region: z.string().max(200).nullable().optional(),
  basis: BasisSchema.nullable().optional(),
  degree_levels: z.array(z.string()).optional(),
  requirements_summary: z.string().nullable().optional(),
  coverage_type: CoverageTypeSchema.default("various"),
  coverage_amount: z.number().nullable().optional(),
  coverage_currency: z.string().max(10).nullable().optional(),
  coverage_description: z.string().nullable().optional(),
  deadline: z.string().date().nullable().optional(),
  deadline_notes: z.string().nullable().optional(),
  application_url: z.string().url().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  is_published: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

export const ScholarshipListQuery = PaginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  is_published: booleanQueryParam.optional(),
  is_featured: booleanQueryParam.optional(),
  country: z.string().min(1).optional(),
  coverage_min: z.coerce.number().nonnegative().optional(),
  coverage_max: z.coerce.number().nonnegative().optional(),
  deadline_from: z.string().date().optional(),
  deadline_to: z.string().date().optional(),
});

export const PublicScholarshipListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).optional(),
  country: z.string().min(1).optional(),
  basis: BasisSchema.optional(),
  coverage_type: CoverageTypeSchema.optional(),
  degree_level: z.string().min(1).optional(),
  coverage_min: z.coerce.number().nonnegative().optional(),
});

export type ScholarshipInput = z.infer<typeof ScholarshipInputSchema>;
