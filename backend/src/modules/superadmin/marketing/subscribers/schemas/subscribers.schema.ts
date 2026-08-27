import { z } from "zod";

export const SubscriberListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  type: z.enum(["newsletter", "early_interest", "guide_lead"]).optional(),
});

export type SubscriberListQueryInput = z.infer<typeof SubscriberListQuery>;
