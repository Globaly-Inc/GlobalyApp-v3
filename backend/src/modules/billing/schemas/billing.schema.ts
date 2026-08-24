import { z } from "zod";

export const SubscribeInputSchema = z.object({
  plan_code: z.string().min(1),
});
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;
