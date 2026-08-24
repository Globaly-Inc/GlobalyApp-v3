import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { UpsertWebhookSchema } from "../schemas/integrations.schema.js";
import { WEBHOOK_EVENTS } from "../consts.js";
import * as service from "../services/webhooks.service.js";

export async function webhooksRoutes(app: FastifyInstance) {
  app.get("/webhook/events", async (_req, reply) => reply.send(WEBHOOK_EVENTS));

  app.get("/webhook", { preHandler: requireBusinessContext }, async (req, reply) => {
    const settings = await service.getSettings(req.businessId);
    return reply.send(settings);
  });

  app.put("/webhook", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = UpsertWebhookSchema.parse(req.body);
    const settings = await service.upsertSettings(req.businessId, input);
    return reply.send(settings);
  });
}
