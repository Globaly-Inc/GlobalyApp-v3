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

export const SchemaFieldEntityTypeSchema = z.enum(["business_categories", "service_categories", "other_service_categories"]);

/**
 * The field types every entity type may use — the six the business and service category forms have
 * always rendered. Do not extend this list without teaching those forms the new type.
 */
export const CORE_SCHEMA_FIELD_TYPES = ["text", "number", "boolean", "date", "select", "multi_select"] as const;

/**
 * Extra types only an **Other** Service Category may use, for the booking form a Personal Portal user
 * fills in. Kept out of CORE so a booking-only type cannot reach the Super Admin Service Category
 * surface; `assertFieldTypeAllowed` in categories.service.ts is what enforces that.
 *
 * `radio` and `checkbox` are presentation variants, not new data shapes: radio stores and validates
 * exactly like `select`, checkbox exactly like `multi_select`.
 */
export const BOOKING_ONLY_SCHEMA_FIELD_TYPES = [
  "long_text", "time", "datetime", "email", "phone", "radio", "checkbox",
] as const;

export const SchemaFieldTypeSchema = z.enum([...CORE_SCHEMA_FIELD_TYPES, ...BOOKING_ONLY_SCHEMA_FIELD_TYPES]);

/** Field types that need an options list before they can render anything to pick from. */
export const OPTION_FIELD_TYPES: readonly string[] = ["select", "multi_select", "radio", "checkbox"];

/**
 * Optional per-field rules — bounds only. No cross-field conditions ("end after start"): a per-field
 * config cannot express them. Enforced server-side by the booking service, mirrored in the browser
 * only to save a round trip.
 */
export const SchemaFieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    min_length: z.number().int().min(0).max(2000).optional(),
    max_length: z.number().int().min(1).max(2000).optional(),
    // An admin-authored regex. Length-capped here, compiled inside a try/catch on use — never trusted.
    pattern: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, {
    message: "The minimum cannot be above the maximum",
    path: ["min"],
  })
  .refine((v) => v.min_length === undefined || v.max_length === undefined || v.min_length <= v.max_length, {
    message: "The minimum length cannot be above the maximum length",
    path: ["min_length"],
  });

const SchemaFieldBaseSchema = z.object({
  label: z.string().trim().min(1).max(200),
  key: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Key must be lowercase words separated by underscores"),
  type: SchemaFieldTypeSchema,
  is_required: z.boolean().optional(),
  filterable: z.boolean().optional(),
  is_default: z.boolean().optional(),
  options: z.array(z.union([z.string(), z.number()])).max(100).nullable().optional(),
  display_order: z.number().int().min(0).optional(),
  placeholder: z.string().trim().max(200).nullable().optional(),
  help_text: z.string().trim().max(500).nullable().optional(),
  // Text on the wire whatever the field type; coerced per type when the form prefills it.
  default_value: z.string().trim().max(2000).nullable().optional(),
  validation: SchemaFieldValidationSchema.nullable().optional(),
});

const requiresOptions = (data: { type: string; options?: unknown[] | null }) =>
  OPTION_FIELD_TYPES.includes(data.type) ? !!data.options?.length : true;

const optionsMessage = { message: "Add at least one option for this field type", path: ["options"] };

export const SchemaFieldInputSchema = SchemaFieldBaseSchema.refine(requiresOptions, optionsMessage);

export const SchemaFieldUpdateSchema = SchemaFieldBaseSchema.partial().refine(
  (data) => (data.type ? requiresOptions(data as { type: string; options?: unknown[] | null }) : true),
  optionsMessage,
);

/** Reordering is a whole-list operation: one category's field ids, in the order they should render. */
export const SchemaFieldOrderSchema = z.object({
  field_ids: z.array(z.number().int().positive()).min(1).max(100),
});

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
export type SchemaFieldType = z.infer<typeof SchemaFieldTypeSchema>;
export type SchemaFieldValidation = z.infer<typeof SchemaFieldValidationSchema>;
export type SchemaFieldOrderInput = z.infer<typeof SchemaFieldOrderSchema>;
export type DefaultServicesInput = z.infer<typeof DefaultServicesInputSchema>;
export type LookupInput = z.infer<typeof LookupInputSchema>;
export type FeeTypeInput = z.infer<typeof FeeTypeInputSchema>;
export type IssuingOrgInput = z.infer<typeof IssuingOrgInputSchema>;
export type AccreditationInput = z.infer<typeof AccreditationInputSchema>;
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
