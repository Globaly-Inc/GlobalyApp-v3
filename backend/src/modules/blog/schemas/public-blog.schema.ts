import { z } from "zod";

export const PublicPostListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  category: z.string().min(1).optional(),
  country_focus: z.string().min(1).optional(),
});

export const IdParam = z.object({ id: z.coerce.number().int().positive() });
