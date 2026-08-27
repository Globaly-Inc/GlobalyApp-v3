// AI blog generation routes — same super_admin-only guard as posts.routes.ts.

import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../../shared/errors.js";
import * as repo from "../../../platform/platform.repository.js";
import { GenerationInputSchema, GenerationListQuery } from "../schemas/generation.schema.js";
import * as service from "../services/generation.service.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage the blog");
}

export async function generationRoutes(app: FastifyInstance) {
  // POST /generation — queue N draft-generation jobs, one blog post each.
  app.post("/generation", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const data = GenerationInputSchema.parse(req.body);
    const result = await service.createGeneration(data);
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_GENERATION_REQUESTED", "blog_generation_job", undefined, {
      count: data.count,
      keywords: data.keywords,
    });
    return reply.status(201).send(result);
  });

  // GET /generation?ids=1,2 — status for a batch, polled by the admin progress panel.
  app.get("/generation", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { ids } = GenerationListQuery.parse(req.query);
    const jobs = await service.getGenerationStatus(ids);
    return reply.send(jobs);
  });
}
