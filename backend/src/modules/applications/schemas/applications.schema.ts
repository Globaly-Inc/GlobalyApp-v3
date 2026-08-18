// Validation schemas for applications + charges.
//
// `.strict()` throughout: a body carrying a field the server owns (status,
// credits_charged, business_id on a charge) is a rejected request, not a silently
// ignored one. On a money path, "silently ignored" is how a client ships a bug
// that looks like it works.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { APPLICATION_STATUSES, CHARGE_STATUSES, ORG_TYPES } from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const CreateApplicationSchema = z
  .object({
    org_type: z.enum(ORG_TYPES),
    org_id: z.number().int().positive(),
    // App-level FK into the owning tenant's business_services — see 20260817_802.
    // Existence is not checked here: the catalogue lives in the tenant schema and
    // the student has no tenant connection. The receiving business sees the id.
    service_id: z.number().int().positive().optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict();

export const MyApplicationsQuery = PaginationSchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const BusinessApplicationsQuery = PaginationSchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const RejectApplicationSchema = z
  .object({ note: z.string().trim().max(2000).optional() })
  .strict();

export const BusinessChargesQuery = PaginationSchema.extend({
  status: z.enum(CHARGE_STATUSES).optional(),
});

export const AdminChargesQuery = PaginationSchema.extend({
  status: z.enum(CHARGE_STATUSES).optional(),
  business_id: z.coerce.number().int().positive().optional(),
  // V1's admin page filtered on a charged_at date range.
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type MyApplicationsInput = z.infer<typeof MyApplicationsQuery>;
export type BusinessApplicationsInput = z.infer<typeof BusinessApplicationsQuery>;
export type BusinessChargesInput = z.infer<typeof BusinessChargesQuery>;
export type AdminChargesInput = z.infer<typeof AdminChargesQuery>;
