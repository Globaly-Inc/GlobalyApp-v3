import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { Campaign, CreateCampaignInput, UpdateCampaignInput } from "./types";

export const businessAdsRealApi = {
  listCampaigns: (): Promise<Campaign[]> => httpGet("/ads/campaigns"),

  createCampaign: (input: CreateCampaignInput): Promise<Campaign> => httpPost("/ads/campaigns", input),

  updateCampaign: (campaignId: number, input: UpdateCampaignInput): Promise<Campaign> =>
    httpPatch(`/ads/campaigns/${campaignId}`, input),

  deleteCampaign: (campaignId: number): Promise<void> => httpDelete(`/ads/campaigns/${campaignId}`),
};
