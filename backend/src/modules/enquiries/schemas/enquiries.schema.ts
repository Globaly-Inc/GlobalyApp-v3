// Zod schemas for enquiry creation endpoints.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const CreateEnquirySchema = z.object({
  course_id: z.string().uuid(),
  extraction_job_id: z.string().uuid().nullable().optional(),
  business_id: z.number().int().positive().nullable().optional(),
  // Optional: the course identifies the enquiry, the message only enriches it. No floor — see
  // 20260830_009 for why "optional but at least 10 characters" was not kept.
  message: z.string().max(5000).nullable().optional(),
  preferred_intake: z.string().nullable().optional(),
  preferred_year: z.number().int().nullable().optional(),
  // Opt-IN: absent means no consent. Never defaulted to true — a client that omits the field
  // must not be treated as having asked for the number to be shared.
  share_contact_number: z.boolean().default(false),
});

export const EnquiryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const CourseIdParamSchema = z.object({
  courseId: z.string().uuid(),
});

export const ListEnquiriesQuerySchema = PaginationSchema.extend({
  status: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

export const EnquiryListItemSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  created_at: z.coerce.date(),
  preferred_intake: z.string().nullable(),
  preferred_year: z.number().nullable(),
  course_name: z.string(),
  course_short_name: z.string().nullable(),
  institution_name: z.string().nullable(),
  institution_logo_url: z.string().nullable(),

  // Businesses that paid to unlock. Only these are exposed — never the full
  // recipient list. See getEnquiryById.
  unlocked_businesses: z.array(
    z.object({
      distribution_id: z.string().uuid(),
      business_id: z.number(),
      business_name: z.string(),
      logo_url: z.string().nullable(),
      city: z.string().nullable(),
      unlocked_at: z.coerce.date(),
      is_closed: z.boolean(),
    }),
  ),
});

// GET /enquiries/:id — full enquiry row plus the same course/institution join as the list.
export const EnquiryDetailSchema = z.object({
  id: z.string().uuid(),
  student_id: z.number(),
  course_id: z.string().uuid(),
  extraction_job_id: z.string().uuid().nullable(),
  institution_id: z.number().int().nullable(),   // public.institutions.id
  business_id: z.number().nullable(),
  // Nullable since 20260830_009 — an enquiry with no message is a course + intake, which is
  // enough to route and enough for a business to act on.
  message: z.string().nullable(),
  share_contact_number: z.boolean(),
  status: z.string(),
  created_at: z.coerce.date(),
  // The verdict computed at submission. NULL on every enquiry created before eligibility
  // shipped — "not evaluated", never "ineligible".
  eligibility_snapshot: z.unknown().nullable(),
  course_name: z.string(),
  course_short_name: z.string().nullable(),
  institution_name: z.string().nullable(),
  institution_logo_url: z.string().nullable(),

  // Businesses that paid to unlock. Only these are exposed — never the full
  // recipient list. See getEnquiryById.
  unlocked_businesses: z.array(
    z.object({
      distribution_id: z.string().uuid(),
      business_id: z.number(),
      business_name: z.string(),
      logo_url: z.string().nullable(),
      city: z.string().nullable(),
      unlocked_at: z.coerce.date(),
      is_closed: z.boolean(),
    }),
  ),
});
