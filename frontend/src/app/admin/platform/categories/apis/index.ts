import { createApi } from "@/lib/api/create-api";
import { categoriesMockApi } from "./mock-data";
import { categoriesRealApi } from "./real-api";

export const categoriesApi = createApi({ mock: categoriesMockApi, real: categoriesRealApi });
export type * from "./types";
