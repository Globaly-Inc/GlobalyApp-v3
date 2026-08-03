// Pagination helpers — parse query params and build paginated responses.

import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

export function paginationToOffset(input: PaginationInput) {
  return {
    limit: input.limit,
    offset: (input.page - 1) * input.limit,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  input: PaginationInput,
) {
  return {
    data,
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}
