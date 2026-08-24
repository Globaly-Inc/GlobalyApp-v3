// Agent ↔ institution representation requests — validation schemas.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const RepresentationStatusSchema = z.enum(["pending", "active", "rejected", "expired"]);

export const RepresentationInviteInputSchema = z.object({
  target_business_id: z.number().int().positive(),
  regions: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const RepresentationStatusPatchSchema = z.object({
  status: z.enum(["active", "rejected"]),
});

export const RepresentationSearchQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

export const RepresentationListQuerySchema = PaginationSchema;

export type RepresentationInviteInput = z.infer<typeof RepresentationInviteInputSchema>;
export type RepresentationStatusPatch = z.infer<typeof RepresentationStatusPatchSchema>;
