import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { CHANNELS } from "../consts.js";

export const NotificationIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const ListNotificationsQuerySchema = PaginationSchema.extend({
  unread: z.coerce.boolean().optional(),
});

export const SetPreferencesSchema = z
  .object({
    preferences: z
      .array(
        z.object({
          notification_type: z.string().trim().min(1).max(100),
          channel: z.enum(CHANNELS),
          enabled: z.boolean(),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const PushTokenSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    user_agent: z.string().max(500).nullish(),
  })
  .strict();
