// Validation schemas for AI blog generation.

import { z } from "zod";

export const GenerationInputSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  context: z.string().trim().max(2000).nullable().optional(),
  count: z.number().int().min(1).max(5),
  topic: z.string().max(50).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
});

// `ids` comes in as "1,2,3" — split, coerce, and drop anything that isn't a positive int
// rather than 400ing on a stray comma or space.
export const GenerationListQuery = z.object({
  ids: z
    .string()
    .min(1)
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    )
    .refine((ids) => ids.length > 0, "No valid ids provided"),
});

export type GenerationInput = z.infer<typeof GenerationInputSchema>;
