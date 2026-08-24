// Wire types for /api/v3/ads/*. Matches backend/src/modules/ads/schemas + repositories.

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type Campaign = {
  id: number;
  business_id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  target_url: string | null;
  budget_minor: number;
  currency: string;
  start_at: string;
  end_at: string | null;
  status: CampaignStatus;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
};

export type CreateCampaignInput = {
  title: string;
  description?: string | null;
  image_url?: string | null;
  target_url?: string | null;
  budget_minor: number;
  currency: string;
  start_at: string;
  end_at?: string | null;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput> & { status?: CampaignStatus };
