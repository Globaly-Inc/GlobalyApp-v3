import { createApi } from "@/lib/api/create-api";
import { coursesMockApi } from "./mock-data";
import { coursesRealApi } from "./real-api";

export const coursesApi = createApi({ mock: coursesMockApi, real: coursesRealApi });
export type { Course, PaginatedResponse } from "./types";
