// Routes for all service category extraction tables.
// Single parametric route set: /services/:serviceType/...

import type { FastifyInstance } from "fastify";
import * as service from "../services/services.service.js";
import {
  ServiceTypeParamSchema,
  ServiceItemParamSchema,
  ServiceListQuerySchema,
} from "../schemas/services.schema.js";

export async function servicesRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // GET /services/:serviceType
  app.get("/services/:serviceType", async (req, reply) => {
    const { serviceType } = ServiceTypeParamSchema.parse(req.params);
    const query = ServiceListQuerySchema.parse(req.query);
    return reply.send(await service.listItems(serviceType, query));
  });

  // GET /services/:serviceType/:id
  app.get("/services/:serviceType/:id", async (req, reply) => {
    const { serviceType, id } = ServiceItemParamSchema.parse(req.params);
    return reply.send(await service.getItem(serviceType, id));
  });

  // PATCH /services/:serviceType/:id
  app.patch("/services/:serviceType/:id", async (req, reply) => {
    const { serviceType, id } = ServiceItemParamSchema.parse(req.params);
    const data = req.body as Record<string, unknown>;
    return reply.send(await service.updateItem(serviceType, id, data, adminId(req)));
  });

  // POST /services/:serviceType/:id/discard
  app.post("/services/:serviceType/:id/discard", async (req, reply) => {
    const { serviceType, id } = ServiceItemParamSchema.parse(req.params);
    return reply.send(await service.discardItem(serviceType, id, adminId(req)));
  });

  // POST /services/:serviceType/:id/promote
  app.post("/services/:serviceType/:id/promote", async (req, reply) => {
    const { serviceType, id } = ServiceItemParamSchema.parse(req.params);
    return reply.send(await service.promoteItem(serviceType, id, adminId(req)));
  });

  // DELETE /services/:serviceType/:id
  app.delete("/services/:serviceType/:id", async (req, reply) => {
    const { serviceType, id } = ServiceItemParamSchema.parse(req.params);
    return reply.send(await service.deleteItem(serviceType, id, adminId(req)));
  });
}
