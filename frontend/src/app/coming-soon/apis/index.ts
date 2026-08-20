import { createApi } from "@/lib/api/create-api";
import { comingSoonMockApi } from "./mock-data";
import { comingSoonRealApi } from "./real-api";

export const comingSoonApi = createApi({ mock: comingSoonMockApi, real: comingSoonRealApi });
export type { RegisterParams } from "./types";
