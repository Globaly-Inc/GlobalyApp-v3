// Owner-scoped ad management, behind requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — and never from the path or body. Same contract as
// enquiries/routes/business-enquiries.routes.ts.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  CampaignCreateSchema,
  CampaignListQuery,
  CampaignPatchSchema,
  CreativeCreateSchema,
  CreativePatchSchema,
  IdParamSchema,
  PlacementsPutSchema,
} from "../schemas/ads.schema.js";
import * as service from "../services/campaigns.service.js";

/**
 * BusinessRecord.id is declared string in core/types.ts but the column is a serial
 * — Number() is the narrowing, not a cast that could lie. Same precedent as
 * billing/routes/context.ts.
 */
function businessId(req: { business?: { id: string | number } }): number {
  return Number(req.business!.id);
}

export async function businessAdsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  // ── campaigns ───────────────────────────────────────────────────────────
  app.get("/campaigns", async (req, reply) => {
    const query = CampaignListQuery.parse(req.query);
    return reply.send(await service.list(businessId(req), query));
  });

  app.post("/campaigns", async (req, reply) => {
    const input = CampaignCreateSchema.parse(req.body);
    const row = await service.create(businessId(req), Number(req.auth.sub), input);
    return reply.status(201).send(row);
  });

  app.get("/campaigns/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.get(businessId(req), id));
  });

  app.patch("/campaigns/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CampaignPatchSchema.parse(req.body);
    return reply.send(await service.update(businessId(req), id, input));
  });

  // ── creatives ───────────────────────────────────────────────────────────
  app.get("/campaigns/:id/creatives", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listCreatives(businessId(req), id));
  });

  app.post("/campaigns/:id/creatives", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CreativeCreateSchema.parse(req.body);
    return reply.status(201).send(await service.addCreative(businessId(req), id, input));
  });

  app.patch("/creatives/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CreativePatchSchema.parse(req.body);
    return reply.send(await service.updateCreative(businessId(req), id, input));
  });

  app.delete("/creatives/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.removeCreative(businessId(req), id);
    return reply.status(204).send();
  });

  // ── placements ──────────────────────────────────────────────────────────
  app.get("/campaigns/:id/placements", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listPlacements(businessId(req), id));
  });

  app.put("/campaigns/:id/placements", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { placements } = PlacementsPutSchema.parse(req.body);
    return reply.send(await service.replacePlacements(businessId(req), id, placements));
  });

  // ── analytics ───────────────────────────────────────────────────────────
  app.get("/campaigns/:id/analytics", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.analytics(businessId(req), id));
  });
}
