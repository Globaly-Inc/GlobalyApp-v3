// Review routes — maps V2 endpoints RA1-RA5, RCa1-RCa4.

import type { FastifyInstance } from "fastify";
import * as service from "../services/review.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import { PatchAgentSchema, PatchCampusSchema } from "../schemas/review.schema.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";

export async function reviewRoutes(app: FastifyInstance) {

  // ── Agents ──

  // RA1: GET /jobs/:id/agents
  app.get("/jobs/:id/agents", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listAgents(id));
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
    return reply.send(await service.patchAgent(id, input, await adminId(req)));
  });

  // RA4: POST /agents/:id/approve
  app.post("/agents/:id/approve", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.approveAgent(id, await adminId(req)));
  });

  // RA5: POST /agents/:id/reject
  app.post("/agents/:id/reject", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.rejectAgent(id, await adminId(req)));
  });

  // ── Campuses ──

  // RCa1: GET /jobs/:id/campuses
  app.get("/jobs/:id/campuses", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listCampuses(id));
  });

  // RCa2: PATCH /campuses/:id
  app.patch("/campuses/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchCampusSchema.parse(req.body);
    return reply.send(await service.patchCampus(id, input, await adminId(req)));
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
