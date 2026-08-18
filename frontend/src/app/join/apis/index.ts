import { createApi } from "@/lib/api/create-api";
import { joinMockApi } from "./mock-data";
import { joinRealApi } from "./real-api";

export const joinApi = createApi({ mock: joinMockApi, real: joinRealApi });

export type { ReferralConfig, ReferralLookup } from "./types";
