import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  RepresentationInviteInputSchema, RepresentationSearchQuerySchema, RepresentationStatusPatchSchema,
} from "../schemas/representations.schema.js";
import * as service from "../services/representations.service.js";
import * as activityService from "../services/activity.service.js";

const UuidParamSchema = z.object({ subId: z.string().uuid() });

export async function businessRepresentationsRoutes(app: FastifyInstance) {
  app.get("/representations", { preHandler: requireBusinessContext }, async (req, reply) => {
    return reply.send(await service.listForBusiness(Number(req.business!.id)));
  });

  app.get("/representations/search", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { search } = RepresentationSearchQuerySchema.parse(req.query);
    const results = await service.searchTargets(Number(req.business!.id), req.business!.business_type, search, 20);
    return reply.send(results);
  });

  app.post("/representations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = RepresentationInviteInputSchema.parse(req.body);
    const rep = await service.createInvite(Number(req.business!.id), req.business!.business_type, Number(req.auth.sub), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "REPRESENTATION_INVITED", "representation", rep.id, { target_business_id: data.target_business_id });
    return reply.status(201).send(rep);
  });

  app.patch("/representations/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = UuidParamSchema.parse(req.params);
    const { status } = RepresentationStatusPatchSchema.parse(req.body);
    const rep = await service.respond(Number(req.business!.id), req.business!.business_type, subId, status, Number(req.auth.sub));
    await activityService.logActivity(req.db, Number(req.auth.sub), "REPRESENTATION_RESPONDED", "representation", subId, { status });
    return reply.send(rep);
  });
}
