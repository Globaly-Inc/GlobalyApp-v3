// Extraction visa services routes — review UI for source_type: "visa_service" jobs.

import type { FastifyInstance } from "fastify";
import * as service from "../services/visa-services.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import { PatchVisaServiceSchema, VisaServiceListQuerySchema } from "../schemas/visa-services.schema.js";

export async function visaServicesRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // GET /jobs/:id/visa-services
  app.get("/jobs/:id/visa-services", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { status } = VisaServiceListQuerySchema.parse(req.query);
    return reply.send(await service.listVisaServices(id, status));
  });

  // PATCH /visa-services/:id
  app.patch("/visa-services/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchVisaServiceSchema.parse(req.body);
    return reply.send(await service.patchVisaService(id, input, adminId(req)));
  });

  // POST /visa-services/:id/approve
  app.post("/visa-services/:id/approve", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.approveVisaService(id, adminId(req)));
  });

  // POST /visa-services/:id/discard
  app.post("/visa-services/:id/discard", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.discardVisaService(id, adminId(req)));
  });

  // DELETE /visa-services/:id
  app.delete("/visa-services/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteVisaService(id, adminId(req)));
  });
}
