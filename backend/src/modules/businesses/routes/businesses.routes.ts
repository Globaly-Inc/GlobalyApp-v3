// Business routes — public registration + auth-required profile management.

import type { FastifyInstance } from "fastify";
import { BusinessRegisterSchema, BusinessProfilePatchSchema } from "../schemas/businesses.schema.js";
import * as service from "../services/businesses.service.js";

export async function businessRoutes(app: FastifyInstance) {
  // Public: Register business (creates business + DB + owner)
  app.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = BusinessRegisterSchema.parse(req.body);
    const result = await service.registerBusiness(input);
    return reply.status(201).send(result);
  });

  // Auth-required: Get business profile
  app.get("/me", async (req, reply) => {
    const result = await service.getProfile(req.auth.orgId!);
    return reply.send(result);
  });

  // Auth-required: Update business profile
  app.patch("/me", async (req, reply) => {
    const data = BusinessProfilePatchSchema.parse(req.body);
    const result = await service.updateProfile(req.auth.orgId!, data);
    return reply.send(result);
  });
}
