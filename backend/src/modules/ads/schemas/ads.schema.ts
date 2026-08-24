import { z } from "zod";

export const CreateCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  image_url: z.string().url().nullish(),
  target_url: z.string().url().nullish(),
  budget_minor: z.number().int().positive(),
  currency: z.string().length(3).default("USD"),
  start_at: z.coerce.date(),
  end_at: z.coerce.date().nullish(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial().extend({
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
});
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

export const CampaignIdParamSchema = z.object({ campaignId: z.coerce.number().int().positive() });
