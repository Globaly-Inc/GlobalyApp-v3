import { createApi } from "@/lib/api/create-api";
import { signupMockApi } from "./mock-data";
import { signupRealApi } from "./real-api";

export const signupApi = createApi({ mock: signupMockApi, real: signupRealApi });
export type { Lead } from "./types";
