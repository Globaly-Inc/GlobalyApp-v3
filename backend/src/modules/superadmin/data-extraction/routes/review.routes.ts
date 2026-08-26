// Review routes — maps V2 endpoints RA1-RA5, RCa1-RCa4.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "../services/review.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import { PatchAgentSchema, PatchCampusSchema } from "../schemas/review.schema.js";
import { PaginationSchema, paginationToOffset } from "../../../../shared/pagination.js";

export async function reviewRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // ── Agents ──

  // RA1: GET /jobs/:id/agents
  app.get("/jobs/:id/agents", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listAgents(id));
  });

  // GET /jobs/:id/agents-filtered — paginated + searchable, unlike RA1's full dump
  app.get("/jobs/:id/agents-filtered", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const pagination = PaginationSchema.parse(req.query);
    const { search } = z.object({ search: z.string().optional() }).parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    return reply.send(await service.listAgentsFiltered(id, limit, offset, pagination, { search }));
  });

  // RA2: GET /jobs/:id/mara-agents
  app.get("/jobs/:id/mara-agents", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listMaraAgents(id));
  });

  // RA3: PATCH /agents/:id
  app.patch("/agents/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchAgentSchema.parse(req.body);
    return reply.send(await service.patchAgent(id, input, adminId(req)));
  });

  // RA4: POST /agents/:id/approve
  app.post("/agents/:id/approve", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.approveAgent(id, adminId(req)));
  });

  // RA5: POST /agents/:id/reject
  app.post("/agents/:id/reject", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.rejectAgent(id, adminId(req)));
  });

  // ── Campuses ──

  // RCa1: GET /jobs/:id/campuses
  app.get("/jobs/:id/campuses", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listCampuses(id));
  });

  // GET /jobs/:id/campuses-filtered — paginated + searchable, unlike RCa1's full dump
  app.get("/jobs/:id/campuses-filtered", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const pagination = PaginationSchema.parse(req.query);
    const { search } = z.object({ search: z.string().optional() }).parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    return reply.send(await service.listCampusesFiltered(id, limit, offset, pagination, { search }));
  });

  // RCa2: PATCH /campuses/:id
  app.patch("/campuses/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchCampusSchema.parse(req.body);
    return reply.send(await service.patchCampus(id, input, adminId(req)));
  });

  // RCa3: GET /jobs/:id/visas
  app.get("/jobs/:id/visas", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listVisas(id));
  });

  // RCa4: GET /jobs/:id/verification-results
  app.get("/jobs/:id/verification-results", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listVerificationResults(id));
  });
}
