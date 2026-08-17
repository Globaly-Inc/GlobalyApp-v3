// Zod schemas for the public catalog. Everything here is untrusted query input
// from an unauthenticated visitor, so every filter is parsed into a typed value
// and nothing reaches SQL as an identifier.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

/** Accepts an integer id or a slug for the reference filters — public URLs want slugs. */
const idOrSlug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((value) => (/^\d+$/.test(value) ? { id: Number(value) } : { slug: value.toLowerCase() }));

export const SORTS = ["relevance", "newest", "name", "price_asc", "price_desc", "featured"] as const;

export const ListServicesQuerySchema = PaginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),

  country: z.string().trim().min(1).max(120).optional(), // id, ISO2/ISO3 or name
  city: z.string().trim().min(1).max(120).optional(),
  category: idOrSlug.optional(),
  degree_level: idOrSlug.optional(),
  area_of_study: idOrSlug.optional(),

  fee_min: z.coerce.number().nonnegative().optional(),
  fee_max: z.coerce.number().nonnegative().optional(),
  intake_month: z.coerce.number().int().min(1).max(12).optional(),
  intake_from: z.coerce.date().optional(),

  study_mode: z.enum(["on_campus", "online", "blended"]).optional(),
  featured: z.coerce.boolean().optional(),
  org_type: z.enum(["business", "institution"]).optional(),
  org_id: z.coerce.number().int().positive().optional(),

  sort: z.enum(SORTS).default("relevance"),
}).refine((v) => v.fee_min === undefined || v.fee_max === undefined || v.fee_min <= v.fee_max, {
  message: "fee_min must be less than or equal to fee_max",
});

export type ListServicesQuery = z.infer<typeof ListServicesQuerySchema>;

export const ServiceIdParamSchema = z.object({
  id: z.string().uuid(),
});
