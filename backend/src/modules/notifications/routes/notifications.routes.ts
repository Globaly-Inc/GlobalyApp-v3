// Prefix: /api/v3/notifications — the signed-in person's own inbox.
// Every handler derives the owner from the JWT; no route accepts a user id.

import type { FastifyInstance } from "fastify";
import * as service from "../services/notifications.service.js";
import {
  ListNotificationsQuerySchema,
  NotificationIdParamSchema,
  PushTokenSchema,
  SetPreferencesSchema,
} from "../schemas/notifications.schema.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = ListNotificationsQuerySchema.parse(req.query ?? {});
    return reply.send(await service.list(Number(req.auth.sub), query));
  });

  app.get("/unread-count", async (req, reply) => {
    return reply.send(await service.unreadCount(Number(req.auth.sub)));
  });

  app.post("/read-all", async (req, reply) => {
    return reply.send(await service.markAllRead(Number(req.auth.sub)));
  });

  app.post("/:id/read", async (req, reply) => {
    const { id } = NotificationIdParamSchema.parse(req.params);
    await service.markRead(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = NotificationIdParamSchema.parse(req.params);
    await service.remove(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // ── preferences ──
  app.get("/preferences", async (req, reply) => {
    return reply.send(await service.getPreferences(Number(req.auth.sub)));
  });

  app.put("/preferences", async (req, reply) => {
    const { preferences } = SetPreferencesSchema.parse(req.body ?? {});
    return reply.send(await service.setPreferences(Number(req.auth.sub), preferences));
  });

  // ── push tokens (V2 push-tokens.ts) ──
  app.post("/push-tokens", async (req, reply) => {
    const { token, user_agent } = PushTokenSchema.parse(req.body ?? {});
    return reply.send(await service.registerPushToken(Number(req.auth.sub), token, user_agent ?? null));
  });

  app.delete("/push-tokens", async (req, reply) => {
    const { token } = PushTokenSchema.parse(req.body ?? {});
    return reply.send(await service.unregisterPushToken(Number(req.auth.sub), token));
  });
}
