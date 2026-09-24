import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const RelationListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

export const RelationInputSchema = z.object({
  partner_business_id: z.number().int().positive(),
  // Which table `partner_business_id` points at. businesses.id and institutions.id collide, so
  // the id alone would resolve to the wrong row half the time. Defaults to 'business' so every
  // existing caller and stored payload keeps working unchanged.
  partner_kind: z.enum(["business", "institution"]).default("business"),
  country_ids: z.array(z.number().int().positive()).default([]),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  apply_to_branches: z.boolean().default(false),
});

export const RelationPatchSchema = z.object({
  country_ids: z.array(z.number().int().positive()).optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type RelationInput = z.infer<typeof RelationInputSchema>;
export type RelationPatch = z.infer<typeof RelationPatchSchema>;
