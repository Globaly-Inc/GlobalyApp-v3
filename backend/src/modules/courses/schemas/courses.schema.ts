// Zod schemas for the student-facing courses listing.

import { PaginationSchema } from "../../../shared/pagination.js";

// Pagination only — no filters/search/sort in this first pass.
export const ListCoursesQuerySchema = PaginationSchema;
