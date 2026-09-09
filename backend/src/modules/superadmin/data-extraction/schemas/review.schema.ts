// Zod schemas for extraction review endpoints (agents, campuses).

import { z } from "zod";

// .nullish() (not just .partial()) on every field — .partial() only allows a key to be
// OMITTED, it doesn't allow a present key to be `null`. The frontend sends `null` for a
// cleared/never-extracted field (an empty string would overwrite real data with a blank),
// same convention as CreateCampusSchema/CreateAgentSchema in staged.schema.ts, and a plain
// z.string() here rejected that with "Expected string, received null" on every edit that
// cleared a field.
export const PatchAgentSchema = z
  .object({
    name: z.string().nullish(),
    country: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    website: z.string().nullish(),
    street1: z.string().nullish(),
    street2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postcode: z.string().nullish(),
    address: z.string().nullish(),
    location_count: z.number().int().nullish(),
    logo_url: z.string().nullish(),
  })
  .partial();

export const PatchCampusSchema = z
  .object({
    name: z.string().nullish(),
    address: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    map_link: z.string().nullish(),
    postcode: z.string().nullish(),
  })
  .partial();

export type PatchAgentInput = z.infer<typeof PatchAgentSchema>;
export type PatchCampusInput = z.infer<typeof PatchCampusSchema>;
