import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullish(),
  start_at: z.coerce.date(),
  end_at: z.coerce.date().nullish(),
  is_online: z.boolean().default(false),
  location: z.string().max(300).nullish(),
  meeting_url: z.string().url().nullish(),
  capacity: z.number().int().positive().nullish(),
});
export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  status: z.enum(["draft", "published", "cancelled"]).optional(),
});
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

export const EventIdParamSchema = z.object({ eventId: z.coerce.number().int().positive() });

export const PublicEventsQuerySchema = PaginationSchema;
