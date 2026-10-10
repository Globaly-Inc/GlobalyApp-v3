// Validation schemas for the business_branches table.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const BranchListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  filter_branch: z.enum(["all", "linked_branches", "branches_only"]).default("all"),
});

const SharedServicesSchema = z.union([z.literal("all"), z.array(z.string().uuid())]).default([]);

export const BranchInputSchema = z.object({
  name: z.string().min(1),
  country: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  branch_type: z.enum(["same_company", "subsidiary", "franchise"]).default("same_company"),
  share_description: z.boolean().default(false),
  shared_services: SharedServicesSchema,
  // Stored on the branch's OWN org (it's a real business/institution), not on the parent's
  // business_branches row — hence create-only, and omitted from the patch schema below.
  registration_licenses: z.record(z.string(), z.unknown()).nullable().optional(),
  // Saved on the branch's own org, not the parent's business_branches row. On create, omitted =
  // same website as the parent; null = none. On update only a branch this parent created takes it.
  website: z.string().url().nullable().optional(),
});

export const BranchPatchSchema = BranchInputSchema.omit({ registration_licenses: true }).partial();

export const LinkExistingBranchInputSchema = z.object({
  business_id: z.number().int().positive(),
  branch_type: z.enum(["same_company", "subsidiary", "franchise"]).default("same_company"),
  shared_services: SharedServicesSchema,
});

export type BranchInput = z.infer<typeof BranchInputSchema>;
export type BranchPatch = z.infer<typeof BranchPatchSchema>;
export type LinkExistingBranchInput = z.infer<typeof LinkExistingBranchInputSchema>;
