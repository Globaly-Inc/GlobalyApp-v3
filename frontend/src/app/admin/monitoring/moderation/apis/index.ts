import { createApi } from "@/lib/api/create-api";
import { moderationMockApi } from "./mock-data";
import { moderationRealApi } from "./real-api";

export const moderationApi = createApi({ mock: moderationMockApi, real: moderationRealApi });
export type { ModerationFlag } from "./types";
