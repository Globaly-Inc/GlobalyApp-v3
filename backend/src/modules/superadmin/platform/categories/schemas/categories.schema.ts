// Validation schemas for category management — business/service categories,
// degree_levels/areas_of_study lookups, fee types, issuing organizations, accreditations.

import { z } from "zod";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const CategoryInputSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const SchemaFieldEntityTypeSchema = z.enum(["business_categories", "service_categories"]);

const SchemaFieldBaseSchema = z.object({
  label: z.string().trim().min(1).max(200),
  key: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Key must be lowercase words separated by underscores"),
  type: z.enum(["text", "number", "boolean", "date", "select", "multi_select"]),
  is_required: z.boolean().optional(),
  filterable: z.boolean().optional(),
  is_default: z.boolean().optional(),
  options: z.array(z.union([z.string(), z.number()])).nullable().optional(),
});

const requiresOptions = (data: { type: string; options?: unknown[] | null }) =>
  (data.type === "select" || data.type === "multi_select") ? !!data.options?.length : true;

export const SchemaFieldInputSchema = SchemaFieldBaseSchema.refine(requiresOptions, {
  message: "options is required when type is select or multi_select",
  path: ["options"],
});

export const SchemaFieldUpdateSchema = SchemaFieldBaseSchema.partial().refine(
  (data) => (data.type ? requiresOptions(data as { type: string; options?: unknown[] | null }) : true),
  { message: "options is required when type is select or multi_select", path: ["options"] },
);

export const DefaultServicesInputSchema = z.object({
  service_category_ids: z.array(z.number().int().positive()),
});

const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Slug must be lowercase words separated by underscores");

export const LookupInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug,
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const FeeTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug,
  sort_order: z.number().int().min(0).optional(),
  is_global: z.boolean().optional(),
});

export const IssuingOrgInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  logo_url: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
});

export const AccreditationInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuing_organization_id: z.number().int().positive().nullable().optional(),
  website: z.string().url().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  scope_country_ids: z.array(z.number().int().positive()).optional(),
});

export const ReviewInputSchema = z.object({ decision: z.enum(["approved", "rejected"]) });

export type CategoryInput = z.infer<typeof CategoryInputSchema>;
export type SchemaFieldEntityType = z.infer<typeof SchemaFieldEntityTypeSchema>;
export type SchemaFieldInput = z.infer<typeof SchemaFieldInputSchema>;
export type DefaultServicesInput = z.infer<typeof DefaultServicesInputSchema>;
export type LookupInput = z.infer<typeof LookupInputSchema>;
export type FeeTypeInput = z.infer<typeof FeeTypeInputSchema>;
export type IssuingOrgInput = z.infer<typeof IssuingOrgInputSchema>;
export type AccreditationInput = z.infer<typeof AccreditationInputSchema>;
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
