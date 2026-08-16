import { z } from "zod";

export const SearchListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  country: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});

export const CourseListQuery = SearchListQuery.extend({
  degree_level: z.string().min(1).optional(),
  subject_area: z.string().min(1).optional(),
  fee_min: z.coerce.number().nonnegative().optional(),
  fee_max: z.coerce.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  intake_year: z.coerce.number().int().optional(),
  sort: z.enum(["best_match", "fee_asc", "fee_desc", "duration_asc"]).optional(),
});

export const JobListQuery = SearchListQuery.extend({
  job_type: z.string().min(1).optional(),
  is_remote: z.coerce.boolean().optional(),
});
