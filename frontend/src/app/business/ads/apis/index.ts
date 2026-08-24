import { createApi } from "@/lib/api/create-api";
import { businessAdsMockApi } from "./mock-data";
import { businessAdsRealApi } from "./real-api";

export const businessAdsApi = createApi({ mock: businessAdsMockApi, real: businessAdsRealApi });
export type { Campaign, CampaignStatus, CreateCampaignInput, UpdateCampaignInput } from "./types";
