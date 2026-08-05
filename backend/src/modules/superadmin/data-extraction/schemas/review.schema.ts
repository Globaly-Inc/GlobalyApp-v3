// Zod schemas for extraction review endpoints (agents, campuses).

import { z } from "zod";

export const PatchAgentSchema = z
  .object({
    name: z.string(),
    country: z.string(),
    email: z.string(),
    phone: z.string(),
    website: z.string(),
    street1: z.string(),
    street2: z.string(),
    city: z.string(),
    state: z.string(),
    postcode: z.string(),
    address: z.string(),
    location_count: z.number().int(),
    logo_url: z.string(),
  })
  .partial();

export const PatchCampusSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string(),
    phone: z.string(),
    email: z.string(),
    map_link: z.string(),
    postcode: z.string(),
  })
  .partial();

export type PatchAgentInput = z.infer<typeof PatchAgentSchema>;
export type PatchCampusInput = z.infer<typeof PatchCampusSchema>;
