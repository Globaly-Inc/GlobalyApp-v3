// Validation schemas for the business_services table.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const ServiceSearchQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

export const ServiceInputSchema = z.object({
  name: z.string().min(1),
  service_category_id: z.number().int().positive().nullable(),
  description: z.string().nullable().optional(),
  price: z.number().min(0).nullable().optional(),
});
export const ServicePatchInputSchema = ServiceInputSchema.partial().extend({
  is_published: z.boolean().optional(),
  public_visibility: z.record(z.string(), z.boolean()).nullable().optional(),
});

export const ServiceFieldValuesInputSchema = z.object({
  values: z.array(z.object({ schema_field_id: z.number().int().positive(), value: z.unknown() })),
});

export const ServiceAiAssistSchema = z.object({
  name: z.string().min(1).max(200),
  category_name: z.string().max(200).optional(),
  hint: z.string().max(500).optional(),
});

export const FeeIdParamSchema = SubIdParamSchema.extend({ feeId: z.coerce.number().int().positive() });

export const ServiceFeeInputSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  student_type: z.enum(["domestic", "international", "both"]).optional(),
  period_type: z.string().max(50).optional(),
  currency: z.string().max(10).optional(),
  total_amount: z.number().min(0),
  installments: z.array(z.object({
    label: z.string(),
    lines: z.array(z.object({ fee_type: z.string(), amount: z.number().min(0) })),
  })).optional(),
});
export const ServiceFeePatchInputSchema = ServiceFeeInputSchema.partial();

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
export type ServicePatchInput = z.infer<typeof ServicePatchInputSchema>;
export type ServiceFieldValuesInput = z.infer<typeof ServiceFieldValuesInputSchema>;
export type ServiceAiAssistInput = z.infer<typeof ServiceAiAssistSchema>;
export const IntakeIdParamSchema = SubIdParamSchema.extend({ intakeId: z.coerce.number().int().positive() });

export const ServiceIntakeInputSchema = z.object({
  intake_name: z.string().max(200).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  orientation_date: z.string().nullable().optional(),
  admission_deadline: z.string().nullable().optional(),
  intake_month: z.number().int().min(1).max(12).nullable().optional(),
  intake_year: z.number().int().nullable().optional(),
});
export const ServiceIntakePatchInputSchema = ServiceIntakeInputSchema.partial();

export type ServiceFeeInput = z.infer<typeof ServiceFeeInputSchema>;
export type ServiceFeePatchInput = z.infer<typeof ServiceFeePatchInputSchema>;
export const EligibilityIdParamSchema = SubIdParamSchema.extend({ eligibilityId: z.coerce.number().int().positive() });
export const StudyOptionIdParamSchema = SubIdParamSchema.extend({ optionId: z.coerce.number().int().positive() });
export const StudyUnitIdParamSchema = SubIdParamSchema.extend({ unitId: z.coerce.number().int().positive() });
export const AccreditationRowIdParamSchema = SubIdParamSchema.extend({ rowId: z.coerce.number().int().positive() });

export const ServiceEligibilityInputSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  applicable_to: z.enum(["domestic", "international", "both"]).optional(),
  degree_level_id: z.number().int().positive().nullable().optional(),
  score_type: z.enum(["percentage", "gpa_4", "gpa_10", "cgpa"]).nullable().optional(),
  min_score: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  academic_tests: z.array(z.record(z.string(), z.unknown())).optional(),
  language_tests: z.array(z.record(z.string(), z.unknown())).optional(),
});
export const ServiceEligibilityPatchInputSchema = ServiceEligibilityInputSchema.partial();

export const ServiceStudyOptionInputSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  study_mode: z.enum(["on_campus", "online", "blended"]).optional(),
  study_load: z.enum(["full_time", "part_time"]).optional(),
  duration_value: z.number().int().positive().nullable().optional(),
  duration_unit: z.enum(["days", "weeks", "months", "years"]).optional(),
  applicable_to: z.enum(["domestic", "international", "both"]).optional(),
});
export const ServiceStudyOptionPatchInputSchema = ServiceStudyOptionInputSchema.partial();

export const ServiceStudyUnitInputSchema = z.object({
  unit_code: z.string().max(50).nullable().optional(),
  unit_name: z.string().min(1).max(200),
  credit_points: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  unit_type: z.enum(["compulsory", "elective"]).optional(),
});
export const ServiceStudyUnitPatchInputSchema = ServiceStudyUnitInputSchema.partial();

export const ServiceAccreditationInputSchema = z.object({
  accreditation_id: z.number().int().positive(),
});

export type ServiceIntakeInput = z.infer<typeof ServiceIntakeInputSchema>;
export type ServiceIntakePatchInput = z.infer<typeof ServiceIntakePatchInputSchema>;
export type ServiceEligibilityInput = z.infer<typeof ServiceEligibilityInputSchema>;
export type ServiceEligibilityPatchInput = z.infer<typeof ServiceEligibilityPatchInputSchema>;
export type ServiceStudyOptionInput = z.infer<typeof ServiceStudyOptionInputSchema>;
export type ServiceStudyOptionPatchInput = z.infer<typeof ServiceStudyOptionPatchInputSchema>;
export type ServiceStudyUnitInput = z.infer<typeof ServiceStudyUnitInputSchema>;
export type ServiceStudyUnitPatchInput = z.infer<typeof ServiceStudyUnitPatchInputSchema>;
export type ServiceAccreditationInput = z.infer<typeof ServiceAccreditationInputSchema>;
