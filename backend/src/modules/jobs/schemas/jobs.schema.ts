// Wire contract. Field names are V2's snake_case, so a V2 client is a V3 client.
//
// Server-set columns (business_id, created_by, slug, status, published_at,
// counters) are absent from every writable schema on purpose: they come from the
// JWT or from an explicit lifecycle route, never from a body.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { webUrl } from "../../../shared/url.js";
import {
  AI_ASSIST_TYPES,
  APPLICATION_STAGES,
  APPLY_METHODS,
  JOB_STATUSES,
  JOB_TYPES,
  RESUME_MAX_BYTES,
  RESUME_MIME_TYPES,
} from "../consts.js";

export const JobIdParam = z.object({ jobId: z.coerce.number().int().positive() });
export const ApplicationIdParam = JobIdParam.extend({
  applicationId: z.coerce.number().int().positive(),
});

/** Everything a business may set on a posting. */
const jobFields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1),
  summary: z.string().trim().max(2000).nullish(),
  job_type: z.enum(JOB_TYPES),
  category: z.string().trim().max(100).nullish(),
  location_city: z.string().trim().max(200).nullish(),
  location_country_id: z.coerce.number().int().positive().nullish(),
  is_remote: z.boolean().optional(),
  is_hybrid: z.boolean().optional(),
  company_name: z.string().trim().max(300).nullish(),
  pay_min: z.coerce.number().nonnegative().nullish(),
  pay_max: z.coerce.number().nonnegative().nullish(),
  pay_currency: z.string().trim().length(3).optional(),
  pay_unit: z.enum(["hour", "year"]).optional(),
  skill_tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  work_rights_required: z.boolean().optional(),
  visa_types_allowed: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  apply_method: z.enum(APPLY_METHODS).optional(),
  apply_url: webUrl({ max: 2000 }).nullish(),
  screening_questions: z.array(z.record(z.unknown())).max(20).optional(),
  is_student_friendly: z.boolean().optional(),
  closing_at: z.coerce.date().nullish(),
};

export const CreateJobSchema = z.object(jobFields);
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

// V2's admin PATCH is a `.partial()` of the same field set; the owner-side PATCH
// is the same minus the fields only an admin toggles (is_featured).
export const UpdateJobSchema = z.object(jobFields).partial();
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;

export const BusinessJobsQuery = PaginationSchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
  job_type: z.enum(JOB_TYPES).optional(),
  category: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});
export type BusinessJobsQueryInput = z.infer<typeof BusinessJobsQuery>;

export const AdminJobsQuery = BusinessJobsQuery.extend({
  business_id: z.coerce.number().int().positive().optional(),
});
export type AdminJobsQueryInput = z.infer<typeof AdminJobsQuery>;

/**
 * Resume metadata arrives as one object or not at all, mirroring the DB's
 * `resume_metadata_consistency` CHECK: url without mime/size is not a half-valid
 * upload, it is a rejected one.
 */
export const ResumeSchema = z.object({
  url: webUrl({ max: 2000 }),
  mime_type: z.enum(RESUME_MIME_TYPES),
  size_bytes: z.coerce.number().int().positive().max(RESUME_MAX_BYTES),
});

export const ApplySchema = z.object({
  cover_letter: z.string().trim().max(20000).nullish(),
  screening_answers: z.array(z.record(z.unknown())).max(20).optional(),
  resume: ResumeSchema.optional(),
});
export type ApplyInput = z.infer<typeof ApplySchema>;

export const UpdateApplicationSchema = z
  .object({
    stage: z.enum(APPLICATION_STAGES).optional(),
    notes: z.string().trim().max(5000).nullish(),
  })
  .refine((v) => v.stage !== undefined || v.notes !== undefined, {
    message: "Nothing to update",
  });
export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>;

export const ApplicationsQuery = PaginationSchema.extend({
  stage: z.enum(APPLICATION_STAGES).optional(),
});
export type ApplicationsQueryInput = z.infer<typeof ApplicationsQuery>;

/** V1 job-ai-assist body: { type, context }. */
export const AiAssistSchema = z.object({
  type: z.enum(AI_ASSIST_TYPES),
  context: z.record(z.unknown()),
});
export type AiAssistInput = z.infer<typeof AiAssistSchema>;
