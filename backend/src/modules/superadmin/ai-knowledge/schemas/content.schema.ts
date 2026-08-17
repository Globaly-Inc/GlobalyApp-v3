// Zod schemas for the curated-content half of AI Knowledge.
// The tables carry no CHECK constraints (V3 convention), so the vocabularies below
// are the only thing keeping the columns honest.

import { z } from "zod";

export const UuidParamSchema = z.object({ id: z.string().uuid() });

export const ListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

// ── Visa ──

export const CreateVisaSchema = z.object({
  destination_country: z.string().trim().min(1),
  visa_type: z.string().trim().min(1),
  eligible_nationalities: z.array(z.string()).nullish(),
  requirements: z.record(z.unknown()).default({}),
  required_documents: z.array(z.string()).nullish(),
  processing_time_days: z.number().int().min(0).nullish(),
  application_fee_usd: z.number().int().min(0).nullish(),
  work_rights_hours: z.number().int().min(0).nullish(),
  post_study_visa: z.string().nullish(),
  common_rejections: z.array(z.string()).nullish(),
  last_verified_date: z.string().date().nullish(),
  active: z.boolean().default(true),
});
export const PatchVisaSchema = CreateVisaSchema.partial();

// ── FAQs ──

export const CreateFaqSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  tags: z.array(z.string()).nullish(),
  active: z.boolean().default(true),
});
export const PatchFaqSchema = CreateFaqSchema.partial();

// ── Country guides ──

export const CreateGuideSchema = z.object({
  country: z.string().trim().min(1),
  education_system: z.string().nullish(),
  popular_cities: z.array(z.string()).nullish(),
  cost_of_living_monthly_usd: z.record(z.unknown()).nullish(),
  culture_notes: z.string().nullish(),
  student_life: z.string().nullish(),
  climate: z.string().nullish(),
  last_verified_date: z.string().date().nullish(),
  active: z.boolean().default(true),
});
export const PatchGuideSchema = CreateGuideSchema.partial();

// ── Verification queue ──

export const QUEUE_STATUSES = ["pending", "verified", "rejected"] as const;

export const QueueQuerySchema = z.object({
  status: z.enum(QUEUE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const RejectQueueItemSchema = z.object({
  rejection_reason: z.string().trim().min(1),
});

export type CreateVisaInput = z.infer<typeof CreateVisaSchema>;
export type CreateFaqInput = z.infer<typeof CreateFaqSchema>;
export type CreateGuideInput = z.infer<typeof CreateGuideSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
