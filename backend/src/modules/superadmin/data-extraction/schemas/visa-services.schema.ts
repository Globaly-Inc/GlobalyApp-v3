// Zod schemas for extraction_visa_services review endpoints.

import { z } from "zod";

export const VisaServiceListQuerySchema = z.object({
  status: z.string().optional(),
});

export const PatchVisaServiceSchema = z.object({
  name: z.string().optional(),
  provider_name: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  registration_number: z.string().nullable().optional(),
  registration_body: z.string().nullable().optional(),
  registration_status: z.string().nullable().optional(),
  registration_level: z.string().nullable().optional(),
  fee_amount: z.number().nullable().optional(),
  fee_currency: z.string().nullable().optional(),
  fee_type: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

export type PatchVisaServiceInput = z.infer<typeof PatchVisaServiceSchema>;
