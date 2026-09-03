// Zod schemas for extraction jobs endpoints.

import { z } from "zod";
import { PaginationSchema } from "../../../../shared/pagination.js";

export const JOB_STATUSES = [
  "pending", "processing", "stalled", "extracting", "paused",
  "failed", "declined", "review", "verified", "approved", "done", "exported",
] as const;

export const PROMOTABLE_JOB_STATUSES = ["approved", "verified", "review", "exported", "done"] as const;

export const CreateJobSchema = z.object({
  institution_url: z.string().url(),
  institution_name: z.string().optional(),
  source_type: z.string().optional(),
  business_category_id: z.coerce.number().int().positive().optional(),
  service_category_id: z.coerce.number().int().positive().optional(),
  guided_urls: z.record(z.unknown()).optional(),
  guidance_notes: z.string().optional(),
  sample_course_url: z.string().url().optional(),
  supporting_documents: z.array(z.unknown()).optional(),
  pipeline_progress: z.record(z.unknown()).optional(),
});

export const FailJobSchema = z.object({
  error: z.string().optional(),
  phase: z.string().optional(),
});

export const PatchJobContextSchema = z.object({
  guided_urls: z.record(z.unknown()).nullable().optional(),
  guidance_notes: z.string().nullable().optional(),
});

export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const JobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});

export const ListJobsQuerySchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const FilteredJobsQuerySchema = PaginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  statuses: z.string().optional(), // csv
  exclude_statuses: z.string().optional(), // csv
  source_type: z.string().optional(),
  exclude_source_type: z.string().optional(),
  business_category_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "oldest", "name_asc", "name_desc"]).default("newest"),
});

export const MergeDuplicatesSchema = z.object({
  dry_run: z.boolean(),
});

export const JobEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type FailJobInput = z.infer<typeof FailJobSchema>;
export type PatchJobContextInput = z.infer<typeof PatchJobContextSchema>;
