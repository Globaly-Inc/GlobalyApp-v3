// Validation schemas for the business_representations table (subsidiary/franchise/partner
// relations between a business's own entities — surfaced in the Branches tab).

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const RelationListQuerySchema = PaginationSchema;

export const RelationInputSchema = z.object({
  partner_business_id: z.number().int().positive(),
  relation_type: z.enum(["partner", "subsidiary", "franchise"]).default("partner"),
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
