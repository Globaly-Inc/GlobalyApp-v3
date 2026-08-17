// Request validation for the tenant service catalog (business_services + its
// children and assignment junctions). Shared by the tenant routes under
// /api/v3/businesses/services and the superadmin oversight routes.
//
// Every write body is `.strict()` so a typo'd field is a 400 rather than a
// silently ignored update, and every partial update must carry at least one key.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => text(max).nullish();
const dateString = z.string().regex(ISO_DATE, "expected YYYY-MM-DD").nullish();
const jsonArray = z.array(z.unknown());
const jsonObject = z.record(z.unknown());

/** Zod `.partial()` on an empty body would happily update nothing. */
function atLeastOneField<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().strict().refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  });
}

// ── Params ──────────────────────────────────────────────────────────────────

/** Superadmin routes address a business by its master-schema integer id. */
export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = IdParamSchema.extend({ subId: z.string().uuid() });

export const ServiceParamsSchema = z.object({ id: z.string().uuid() });
export const ChildParamsSchema = ServiceParamsSchema.extend({ childId: z.string().uuid() });
export const StructureParamsSchema = ServiceParamsSchema.extend({ structureId: z.string().uuid() });
export const StructureChildParamsSchema = StructureParamsSchema.extend({ childId: z.string().uuid() });
export const LibraryParamsSchema = z.object({ childId: z.string().uuid() });

// ── Filters ─────────────────────────────────────────────────────────────────

const boolFlag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const ServiceFiltersSchema = z.object({
  search: text(200).min(1).optional(),
  service_category_id: z.coerce.number().int().positive().optional(),
  degree_level_id: z.coerce.number().int().positive().optional(),
  area_of_study_id: z.coerce.number().int().positive().optional(),
  is_published: boolFlag.optional(),
  is_featured: boolFlag.optional(),
});

export type ServiceFilters = z.infer<typeof ServiceFiltersSchema>;

export const ServiceSearchQuerySchema = PaginationSchema.extend({ search: text(200).min(1).optional() });

// ── business_services ───────────────────────────────────────────────────────

const serviceShape = {
  name: text(500).min(1),
  slug: nullableText(300),
  service_category_id: z.number().int().positive().nullish(),
  description: nullableText(20_000),
  overview: nullableText(20_000),
  price: z.number().nonnegative().nullish(),
  price_currency: z.string().trim().length(3).nullish(),
  price_type: nullableText(50),
  duration_value: z.number().int().nonnegative().nullish(),
  duration_unit: nullableText(20),
  image_url: nullableText(2000),
  brochure_url: nullableText(2000),
  tags: z.array(text(100)).nullish(),
  gallery_urls: jsonArray.optional(),
  degree_level_id: z.number().int().positive().nullish(),
  area_of_study_id: z.number().int().positive().nullish(),
  study_mode: z.array(text(50)).nullish(),
  awarded_by_org_type: z.enum(["business", "institution"]).nullish(),
  awarded_by_org_id: z.number().int().positive().nullish(),
  is_published: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  public_visibility: jsonObject.optional(),
  category_specific_data: jsonObject.optional(),
  meta: jsonObject.optional(),
};

/**
 * The awarding body is a polymorphic pair (see the migration): a type with no id
 * points nowhere, and an id with no type is unresolvable. Either both or neither.
 */
function awardedByIsCoherent(v: Record<string, unknown>): boolean {
  const hasType = v.awarded_by_org_type !== undefined && v.awarded_by_org_type !== null;
  const hasId = v.awarded_by_org_id !== undefined && v.awarded_by_org_id !== null;
  if (v.awarded_by_org_type === undefined && v.awarded_by_org_id === undefined) return true;
  return hasType === hasId;
}

const AWARDED_BY_MESSAGE = "awarded_by_org_type and awarded_by_org_id must be set together";

export const CreateServiceSchema = z
  .object(serviceShape)
  .strict()
  .refine(awardedByIsCoherent, { message: AWARDED_BY_MESSAGE });

export const UpdateServiceSchema = atLeastOneField(z.object(serviceShape)).refine(awardedByIsCoherent, {
  message: AWARDED_BY_MESSAGE,
});

// ── Child collections ───────────────────────────────────────────────────────

const feeShape = {
  fee_type_id: z.number().int().positive().nullish(),
  name: nullableText(300),
  student_type: z.enum(["international", "domestic", "both"]).optional(),
  period_type: nullableText(100),
  currency: z.string().trim().length(3).optional(),
  total_amount: z.number().nonnegative().optional(),
  installments: jsonArray.optional(),
  save_for_reuse: z.boolean().optional(),
};

const feeStructureShape = {
  name: text(300).min(1),
  applicable_to: nullableText(50),
  period: nullableText(100),
  currency: z.string().trim().length(3).nullish(),
};

const installmentShape = {
  sort_order: z.number().int().min(0).optional(),
};

const intakeShape = {
  intake_name: nullableText(300),
  start_date: dateString,
  end_date: dateString,
  orientation_date: dateString,
  admission_deadline: dateString,
  intake_month: z.number().int().min(1).max(12).nullish(),
  intake_year: z.number().int().min(1900).max(2200).nullish(),
  save_for_reuse: z.boolean().optional(),
};

const eligibilityShape = {
  name: nullableText(300),
  applicable_to: z.enum(["international", "domestic", "both"]).optional(),
  min_degree_level: nullableText(200),
  degree_level_id: z.number().int().positive().nullish(),
  min_score_percent: z.number().min(0).max(100).nullish(),
  min_score_grade: nullableText(50),
  min_grading_system: nullableText(100),
  min_scores: jsonArray.optional(),
  description: nullableText(20_000),
  academic_tests: jsonArray.optional(),
  language_tests: jsonArray.optional(),
  applicable_countries: z.array(text(100)).optional(),
  save_for_reuse: z.boolean().optional(),
};

const studyOptionShape = {
  name: nullableText(300),
  study_mode: z.enum(["on_campus", "online", "blended"]),
  study_load: z.enum(["full_time", "part_time"]).optional(),
  duration_value: z.number().int().nonnegative().nullish(),
  duration_unit: z.enum(["days", "weeks", "months", "years"]).nullish(),
  applicable_to: z.enum(["international", "domestic", "both"]).optional(),
  save_for_reuse: z.boolean().optional(),
};

const studyUnitShape = {
  unit_code: nullableText(100),
  unit_name: text(300).min(1),
  credit_points: z.number().int().nonnegative().nullish(),
  description: nullableText(20_000),
};

interface WriteSchemas {
  create: z.ZodTypeAny;
  update: z.ZodTypeAny;
}

function pair<T extends z.ZodRawShape>(shape: T): WriteSchemas {
  return { create: z.object(shape).strict(), update: atLeastOneField(z.object(shape)) };
}

export const CHILD_SCHEMAS: Record<string, WriteSchemas> = {
  fees: pair(feeShape),
  "fee-structures": pair(feeStructureShape),
  intakes: pair(intakeShape),
  eligibility: pair(eligibilityShape),
};

export const INSTALLMENT_SCHEMAS = pair(installmentShape);

export const LIBRARY_SCHEMAS: Record<string, WriteSchemas> = {
  "study-options": pair(studyOptionShape),
  "study-units": pair(studyUnitShape),
};

// ── Assignment junctions ────────────────────────────────────────────────────

export const ASSIGNMENT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  fees: z.object({ service_fee_id: z.string().uuid() }).strict(),
  intakes: z.object({ intake_id: z.string().uuid() }).strict(),
  eligibility: z.object({ eligibility_requirement_id: z.string().uuid() }).strict(),
  "study-options": z.object({ study_option_id: z.string().uuid() }).strict(),
  "study-units": z
    .object({
      study_unit_id: z.string().uuid(),
      unit_type: z.enum(["compulsory", "elective"]).optional(),
    })
    .strict(),
  accreditations: z
    .object({
      accreditation_id: z.number().int().positive(),
      registration_number: nullableText(200),
    })
    .strict(),
};

/** Assignment targets are uuids in the tenant schema, except accreditations. */
export const AssignmentTargetParamsSchema = ServiceParamsSchema.extend({
  targetId: z.string().min(1).max(64),
});

// ── Dynamic per-category field values (schema_field_values) ─────────────────

export const ServiceFieldValuesInputSchema = z.object({
  values: z.array(z.object({ schema_field_id: z.number().int().positive(), value: z.unknown() })),
});

export type ServiceFieldValuesInput = z.infer<typeof ServiceFieldValuesInputSchema>;
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
