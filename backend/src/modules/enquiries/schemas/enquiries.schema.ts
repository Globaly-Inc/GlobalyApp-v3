// Zod boundary schemas. Everything that reaches a service has been through one
// of these; nothing here accepts an identity field (student_id / business_id) —
// those come from the JWT, never the body.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { DISTRIBUTION_STATUSES, ENQUIRY_STATUSES } from "../consts.js";

export const CreateEnquirySchema = z
  .object({
    message: z.string().trim().min(1).max(5000),
    preferred_intake: z.string().trim().max(100).nullish(),
    preferred_year: z.coerce.number().int().min(2000).max(2100).nullish(),
    /** uuid of a service inside the target org's tenant schema. */
    service_id: z.string().uuid().nullish(),
    target_org_type: z.enum(["business", "institution"]).nullish(),
    target_org_id: z.coerce.number().int().positive().nullish(),
    /** An agent the student addressed by name — always distributed to. */
    agent_business_id: z.coerce.number().int().positive().nullish(),
  })
  .strict()
  .refine(
    (v) => (v.target_org_type == null) === (v.target_org_id == null),
    { message: "target_org_type and target_org_id must be supplied together" },
  );

export type CreateEnquiryInput = z.infer<typeof CreateEnquirySchema>;

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const DistributionIdParamSchema = z.object({
  distributionId: z.coerce.number().int().positive(),
});

export const ListMyEnquiriesQuerySchema = PaginationSchema.extend({
  status: z.enum(ENQUIRY_STATUSES).optional(),
});
export type ListMyEnquiriesQuery = z.infer<typeof ListMyEnquiriesQuerySchema>;

export const ListInboxQuerySchema = PaginationSchema.extend({
  status: z.enum(DISTRIBUTION_STATUSES).optional(),
  // Tri-state: absent = everything, true = paid for, false = still locked.
  unlocked: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
});
export type ListInboxQuery = z.infer<typeof ListInboxQuerySchema>;

export const AdminListQuerySchema = PaginationSchema.extend({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  student_id: z.coerce.number().int().positive().optional(),
  business_id: z.coerce.number().int().positive().optional(),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;
