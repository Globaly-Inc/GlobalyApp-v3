import { createApi } from "@/lib/api/create-api";
import { scholarshipsMockApi } from "./mock-data";
import { scholarshipsRealApi } from "./real-api";

export const scholarshipsApi = createApi({ mock: scholarshipsMockApi, real: scholarshipsRealApi });
export type { Scholarship } from "./types";
