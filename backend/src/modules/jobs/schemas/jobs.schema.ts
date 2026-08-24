import { z } from "zod";

export const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullish(),
  job_type: z.enum(["full_time", "part_time", "casual", "contract", "internship"]).nullish(),
  location_city: z.string().max(200).nullish(),
  location_country_id: z.number().int().positive().nullish(),
  is_remote: z.boolean().default(false),
  pay_min: z.number().positive().nullish(),
  pay_max: z.number().positive().nullish(),
  pay_currency: z.string().length(3).nullish(),
  pay_unit: z.enum(["hour", "year"]).nullish(),
  closing_date: z.coerce.date().nullish(),
});
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const UpdateJobSchema = CreateJobSchema.partial().extend({
  is_published: z.boolean().optional(),
});
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;

export const JobIdParamSchema = z.object({ jobId: z.coerce.number().int().positive() });

export const ApplyToJobSchema = z.object({
  cover_note: z.string().max(4000).nullish(),
  resume_url: z.string().url().nullish(),
});
export type ApplyToJobInput = z.infer<typeof ApplyToJobSchema>;

export const ApplicationIdParamSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  applicationId: z.coerce.number().int().positive(),
});

export const ReviewApplicationSchema = z.object({
  status: z.enum(["reviewed", "rejected", "hired"]),
});
export type ReviewApplicationInput = z.infer<typeof ReviewApplicationSchema>;
