// Validation schemas for the business_services table.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const ServiceSearchQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

export const ServiceInputSchema = z.object({
  name: z.string().min(1),
  service_category_id: z.number().int().positive().nullable(),
  description: z.string().nullable().optional(),
  price: z.number().min(0).nullable().optional(),
});
export const ServicePatchInputSchema = ServiceInputSchema.partial().extend({
  is_published: z.boolean().optional(),
  public_visibility: z.record(z.string(), z.boolean()).nullable().optional(),
});

export const ServiceFieldValuesInputSchema = z.object({
  values: z.array(z.object({ schema_field_id: z.number().int().positive(), value: z.unknown() })),
});

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
export type ServicePatchInput = z.infer<typeof ServicePatchInputSchema>;
export type ServiceFieldValuesInput = z.infer<typeof ServiceFieldValuesInputSchema>;
