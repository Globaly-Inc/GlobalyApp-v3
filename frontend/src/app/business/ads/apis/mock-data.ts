import type { Campaign, CreateCampaignInput, UpdateCampaignInput } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextId = 2;
let mockCampaigns: Campaign[] = [
  {
    id: 1,
    business_id: 1,
    title: "Autumn Intake Push",
    description: "Promote the March intake to prospective students in South Asia.",
    image_url: null,
    target_url: "https://example.com/programs",
    budget_minor: 50000,
    currency: "USD",
    start_at: new Date().toISOString(),
    end_at: null,
    status: "active",
    impressions: 12400,
    clicks: 312,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const businessAdsMockApi = {
  listCampaigns: async (): Promise<Campaign[]> => {
    console.log("[mock] GET /ads/campaigns");
    await delay(150);
    return mockCampaigns;
  },

  createCampaign: async (input: CreateCampaignInput): Promise<Campaign> => {
    console.log("[mock] POST /ads/campaigns", input);
    await delay(200);
    const campaign: Campaign = {
      id: nextId++,
      business_id: 1,
      title: input.title,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      target_url: input.target_url ?? null,
      budget_minor: input.budget_minor,
      currency: input.currency,
      start_at: input.start_at,
      end_at: input.end_at ?? null,
      status: "draft",
      impressions: 0,
      clicks: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCampaigns = [campaign, ...mockCampaigns];
    return campaign;
  },

  updateCampaign: async (campaignId: number, input: UpdateCampaignInput): Promise<Campaign> => {
    console.log("[mock] PATCH /ads/campaigns/:id", { campaignId, input });
    await delay(150);
    const existing = mockCampaigns.find((c) => c.id === campaignId);
    if (!existing) throw new Error("Ad campaign not found");
    const updated = { ...existing, ...input, updated_at: new Date().toISOString() };
    mockCampaigns = mockCampaigns.map((c) => (c.id === campaignId ? updated : c));
    return updated;
  },

  deleteCampaign: async (campaignId: number): Promise<void> => {
    console.log("[mock] DELETE /ads/campaigns/:id", { campaignId });
    await delay(150);
    mockCampaigns = mockCampaigns.filter((c) => c.id !== campaignId);
  },
};
