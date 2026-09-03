// Validation schemas for the service child+junction family — fees, intakes, eligibility
// requirements, study options, study units, accreditations. Each row belongs to one
// business_services.uuid (`serviceId` route param).

import { z } from "zod";

export const ServiceIdParamSchema = z.object({ serviceId: z.string().uuid() });
export const ChildIdParamSchema = z.object({ serviceId: z.string().uuid(), id: z.coerce.number().int().positive() });

export const FeeInputSchema = z.object({
  name: z.string().nullable().optional(),
  student_type: z.enum(["domestic", "international", "both"]).default("both"),
  period_type: z.string().max(50).default("Per Year"),
  currency: z.string().max(10).default("AUD"),
  total_amount: z.number().min(0).default(0),
  installments: z.array(z.record(z.string(), z.unknown())).default([]),
});
export const FeePatchInputSchema = FeeInputSchema.partial();

export const IntakeInputSchema = z.object({
  intake_name: z.string().nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  orientation_date: z.string().date().nullable().optional(),
  admission_deadline: z.string().date().nullable().optional(),
  intake_month: z.number().int().min(1).max(12).nullable().optional(),
  intake_year: z.number().int().nullable().optional(),
});
export const IntakePatchInputSchema = IntakeInputSchema.partial();

export const EligibilityInputSchema = z.object({
  name: z.string().nullable().optional(),
  applicable_to: z.enum(["domestic", "international", "both"]).default("both"),
  degree_level_id: z.number().int().positive().nullable().optional(),
  score_type: z.enum(["percentage", "gpa_4", "gpa_10", "cgpa"]).nullable().optional(),
  min_score: z.number().min(0).nullable().optional(),
  description: z.string().nullable().optional(),
  academic_tests: z.array(z.record(z.string(), z.unknown())).default([]),
  language_tests: z.array(z.record(z.string(), z.unknown())).default([]),
});
export const EligibilityPatchInputSchema = EligibilityInputSchema.partial();

export const StudyOptionInputSchema = z.object({
  name: z.string().nullable().optional(),
  study_mode: z.enum(["on_campus", "online", "hybrid"]).default("on_campus"),
  study_load: z.enum(["full_time", "part_time"]).default("full_time"),
  duration_value: z.number().int().positive().nullable().optional(),
  duration_unit: z.enum(["days", "weeks", "months", "years"]).default("months"),
  applicable_to: z.enum(["domestic", "international", "both"]).default("both"),
});
export const StudyOptionPatchInputSchema = StudyOptionInputSchema.partial();

export const StudyUnitInputSchema = z.object({
  unit_code: z.string().nullable().optional(),
  unit_name: z.string().min(1),
  credit_points: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  unit_type: z.enum(["compulsory", "elective"]).default("compulsory"),
});
export const StudyUnitPatchInputSchema = StudyUnitInputSchema.partial();

export const AccreditationLinkInputSchema = z.object({
  accreditation_id: z.number().int().positive(),
});

export type FeeInput = z.infer<typeof FeeInputSchema>;
export type IntakeInput = z.infer<typeof IntakeInputSchema>;
export type EligibilityInput = z.infer<typeof EligibilityInputSchema>;
export type StudyOptionInput = z.infer<typeof StudyOptionInputSchema>;
export type StudyUnitInput = z.infer<typeof StudyUnitInputSchema>;
export type AccreditationLinkInput = z.infer<typeof AccreditationLinkInputSchema>;
