import { httpGet } from "@/lib/api/http";
import type { Course, PaginatedResponse } from "./types";

export const coursesRealApi = {
  listCourses: (page = 1, limit = 20): Promise<PaginatedResponse<Course>> =>
    httpGet(`/courses?page=${page}&limit=${limit}`),
};
