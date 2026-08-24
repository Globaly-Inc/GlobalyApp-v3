import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { CampaignIdParamSchema, CreateCampaignSchema, UpdateCampaignSchema } from "../schemas/ads.schema.js";
import * as service from "../services/campaigns.service.js";

export async function campaignsRoutes(app: FastifyInstance) {
  app.get("/campaigns", { preHandler: requireBusinessContext }, async (req, reply) => {
    const campaigns = await service.list(req.businessId);
    return reply.send(campaigns);
  });

  app.post("/campaigns", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = CreateCampaignSchema.parse(req.body);
    const campaign = await service.create(req.businessId, input);
    return reply.status(201).send(campaign);
  });

  app.get("/campaigns/:campaignId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { campaignId } = CampaignIdParamSchema.parse(req.params);
    const campaign = await service.getOne(campaignId, req.businessId);
    return reply.send(campaign);
  });

  app.patch("/campaigns/:campaignId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { campaignId } = CampaignIdParamSchema.parse(req.params);
    const input = UpdateCampaignSchema.parse(req.body);
    const campaign = await service.update(campaignId, req.businessId, input);
    return reply.send(campaign);
  });

  app.delete("/campaigns/:campaignId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { campaignId } = CampaignIdParamSchema.parse(req.params);
    await service.remove(campaignId, req.businessId);
    return reply.status(204).send();
  });
}
