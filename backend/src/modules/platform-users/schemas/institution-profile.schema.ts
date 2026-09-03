// Self-service institution profile — the institution twin of businesses' BusinessProfilePatchSchema.

import { z } from "zod";

export const InstitutionProfilePatchSchema = z.object({
  institution_name: z.string().min(1),
  description: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  country_id: z.number().int().positive().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  is_published: z.boolean(),
}).partial().strict();

export type InstitutionProfilePatchInput = z.infer<typeof InstitutionProfilePatchSchema>;
