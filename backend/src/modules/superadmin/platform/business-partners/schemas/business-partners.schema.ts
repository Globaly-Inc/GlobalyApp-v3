// Validation schemas for the business_partners table (agency/consultancy links).

import { z } from "zod";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const PartnerInputSchema = z.object({ partner_business_id: z.number().int().positive() });
export const PartnerStatusInputSchema = z.object({ status: z.enum(["requested", "active", "inactive"]) });

export type PartnerInput = z.infer<typeof PartnerInputSchema>;
export type PartnerStatusInput = z.infer<typeof PartnerStatusInputSchema>;
