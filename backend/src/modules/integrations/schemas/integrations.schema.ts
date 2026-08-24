import { z } from "zod";
import { WEBHOOK_EVENTS } from "../consts.js";

export const UpsertWebhookSchema = z.object({
  url: z.string().url(),
  subscribed_events: z.array(z.enum(WEBHOOK_EVENTS)).default([]),
  is_active: z.boolean().default(true),
});
export type UpsertWebhookInput = z.infer<typeof UpsertWebhookSchema>;
