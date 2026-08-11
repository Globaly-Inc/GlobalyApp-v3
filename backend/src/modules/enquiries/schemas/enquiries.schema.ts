// Zod schemas for enquiry creation endpoints.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const CreateEnquirySchema = z.object({
  course_id: z.string().uuid(),
  extraction_job_id: z.string().uuid().nullable().optional(),
  business_id: z.number().int().positive().nullable().optional(),
  message: z.string().min(10).max(5000),
  preferred_intake: z.string().nullable().optional(),
  preferred_year: z.number().int().nullable().optional(),
});

export const EnquiryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListEnquiriesQuerySchema = PaginationSchema.extend({
  status: z.string().optional(),
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
});

// GET /enquiries/:id — full enquiry row plus the same course/institution join as the list.
export const EnquiryDetailSchema = z.object({
  id: z.string().uuid(),
  student_id: z.number(),
  course_id: z.string().uuid(),
  extraction_job_id: z.string().uuid().nullable(),
  institution_id: z.string().uuid().nullable(),
  business_id: z.number().nullable(),
  message: z.string(),
  status: z.string(),
  created_at: z.coerce.date(),
  course_name: z.string(),
  course_short_name: z.string().nullable(),
  institution_name: z.string().nullable(),
  institution_logo_url: z.string().nullable(),
});
