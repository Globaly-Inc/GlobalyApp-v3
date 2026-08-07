import { createApi } from "@/lib/api/create-api";
import { ambassadorProgramsMockApi } from "./mock-data";
import { ambassadorProgramsRealApi } from "./real-api";

export const ambassadorProgramsApi = createApi({ mock: ambassadorProgramsMockApi, real: ambassadorProgramsRealApi });
export type { AmbassadorProgram } from "./types";
