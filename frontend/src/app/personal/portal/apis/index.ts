import { createApi } from "@/lib/api/create-api";
import { homeMockApi } from "./mock-data";
import { homeRealApi } from "./real-api";

export const homeApi = createApi({ mock: homeMockApi, real: homeRealApi });
export type { RecentEnquiry, RecentEnquiries } from "./types";
