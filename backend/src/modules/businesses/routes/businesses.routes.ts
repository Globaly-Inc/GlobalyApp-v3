// Business routes — registration (any authenticated user) + profile management (business context required).

import type { FastifyInstance } from "fastify";
import { BusinessRegisterSchema, BusinessProfilePatchSchema, BusinessSearchQuerySchema } from "../schemas/businesses.schema.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/businesses.service.js";

export async function businessRoutes(app: FastifyInstance) {
  // Auth-required: Register business (any platform user can create a business)
  app.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = BusinessRegisterSchema.parse(req.body);
    const result = await service.registerBusiness(Number(req.auth.sub), input);
    return reply.status(201).send(result);
  });

  // Business context required: search other businesses (e.g. to link a partner)
  app.get("/search", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { search, limit } = BusinessSearchQuerySchema.parse(req.query);
    const result = await service.searchBusinesses(req.auth.orgId!, search, limit);
    return reply.send(result);
  });

  // Business context required: Get business profile
  app.get("/me", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.getProfile(req.auth.orgId!);
    return reply.send(result);
  });

  // Business context required: Update business profile
  app.patch("/me", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = BusinessProfilePatchSchema.parse(req.body);
    const result = await service.updateProfile(req.auth.orgId!, data);
    return reply.send(result);
  });
}
