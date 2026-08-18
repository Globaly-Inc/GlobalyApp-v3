// Courses service — student-facing browse of extracted courses.

import * as repo from "../repositories/courses.repository.js";
import {
  paginationToOffset,
  buildPaginatedResponse,
  type PaginationInput,
} from "../../../shared/pagination.js";

export async function listCourses(pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listCourses({ limit, offset }),
    repo.countCourses(),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}
