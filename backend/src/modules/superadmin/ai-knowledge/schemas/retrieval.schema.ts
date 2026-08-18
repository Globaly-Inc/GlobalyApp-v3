// Zod schemas for the retrieval and embedding admin endpoints.

import { z } from "zod";
import { MAX_TOP_K } from "../repositories/retrieval.repository.js";

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Give the search at least two characters").max(500),
  limit: z.coerce.number().int().min(1).max(MAX_TOP_K).default(5),
  kind: z.string().trim().min(1).max(60).optional(),
  country: z.string().trim().length(2).optional(),
  // Exposed so an admin can see for themselves what each leg contributes; the
  // recall gate uses the same switch.
  legs: z.enum(["hybrid", "vector", "text"]).default("hybrid"),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const ReembedSchema = z.object({
  /** One document, or omit for a backlog sweep. */
  document_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type ReembedInput = z.infer<typeof ReembedSchema>;
