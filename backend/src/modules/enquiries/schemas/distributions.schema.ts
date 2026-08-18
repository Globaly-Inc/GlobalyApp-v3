// Zod schemas for business-facing distribution endpoints — list-only.

import { z } from "zod";

// Mirrors chk_business_enquiries_status / chk_enquiries_status — the tenant row's
// vocabulary, since that is what the list returns.
export const ENQUIRY_STATUSES = [
  "pending",
  "distributed",
  "unlocked",
  "in_conversation",
  "converted",
  "closed",
  "no_match",
  "expired",
] as const;

export const ListDistributionsQuerySchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// Response shape for GET /enquiry-distributions — read from the tenant table,
// enriched with central enquiry/course/institution fields for display.
export const DistributionListItemSchema = z.object({
  enquiry_id: z.string(),
  distribution_id: z.string(),
  status: z.string(),
  tier: z.number().nullable(),
  match_rank: z.number().nullable(),
  message: z.string().nullable(),
  // True when `message` is only a teaser because the row is not unlocked yet.
  message_truncated: z.boolean(),
  preferred_intake: z.string().nullable(),
  preferred_year: z.number().nullable(),
  course_name: z.string().nullable(),
  course_short_name: z.string().nullable(),
  institution_name: z.string().nullable(),
  created_at: z.coerce.date(),

  accept_count: z.number(),
  max_accepts: z.number(),

  is_unlocked: z.boolean(),
  coin_cost: z.number(),
  unlocked_at: z.coerce.date().nullable(),
  closed_at: z.coerce.date().nullable(),
  close_reason: z.string().nullable(),

  // Populated only once unlocked.
  student_name: z.string().nullable(),
  student_email: z.string().nullable(),
  student_phone: z.string().nullable(),
});

export const DistributionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// A reason is mandatory: the whole point of per-distribution closure is knowing WHY
// this particular business dropped the lead.
export const CloseDistributionSchema = z.object({
  close_reason: z.string().trim().min(3, "Tell us why in at least 3 characters").max(1000),
});
