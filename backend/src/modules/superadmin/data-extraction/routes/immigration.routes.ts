// Immigration routes — maps V2 endpoints I1-I8.

import type { FastifyInstance } from "fastify";
import * as service from "../services/immigration.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import {
  ImmigrationListQuerySchema,
  PromoteVisaSchema,
  ExtractVisasSchema,
  ExtractMaraSchema,
} from "../schemas/immigration.schema.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";

export async function immigrationRoutes(app: FastifyInstance) {

  // I1: GET /visas
  app.get("/visas", async (req, reply) => {
    const query = ImmigrationListQuerySchema.parse(req.query);
    return reply.send(await service.listVisas(query));
  });

  // I2: GET /mara-agents
  app.get("/mara-agents", async (req, reply) => {
    const query = ImmigrationListQuerySchema.parse(req.query);
    return reply.send(await service.listMaraAgents(query));
  });

  // I3: POST /visas/:id/discard
  app.post("/visas/:id/discard", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.discardVisa(id, await adminId(req)));
  });

  // I4: POST /mara-agents/:id/discard
  app.post("/mara-agents/:id/discard", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.discardMara(id, await adminId(req)));
  });

  // I5: POST /visas/:id/promote
  app.post("/visas/:id/promote", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { org_type, org_id } = PromoteVisaSchema.parse(req.body);
    return reply.send(await service.promoteVisa(id, org_type, org_id, await adminId(req)));
  });

  // I6: POST /mara-agents/:id/promote
  app.post("/mara-agents/:id/promote", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.promoteMara(id, await adminId(req)));
  });

  // I7: POST /visas/extract — fail-closed 503 (§3.8). Validation runs first so the
  // request contract stays verified; only the provider call is missing.
  app.post("/visas/extract", async (req) => {
    service.extractVisas(ExtractVisasSchema.parse(req.body));
  });

  // I8: POST /mara-agents/extract — same.
  app.post("/mara-agents/extract", async (req) => {
    service.extractMara(ExtractMaraSchema.parse(req.body));
  });
}
