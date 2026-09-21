// Registration types — the identifier a business quotes where it is registered (ABN, UEN, EIN…).
// Admin CRUD for Platform → Categories → Registration Types. The business-facing read lives in
// businesses/routes/lookups.routes.ts, like the other catalogs.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../../../shared/pagination.js";
import {
  IdParamSchema, RegistrationTypeInputSchema, RegistrationTypeListQuerySchema,
} from "../schemas/categories.schema.js";
import * as service from "../services/categories.service.js";

export async function registrationTypeRoutes(app: FastifyInstance) {
  app.get("/registration-types", async (req, reply) => {
    const { country_id, search } = RegistrationTypeListQuerySchema.parse(req.query);
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listRegistrationTypes(limit, offset, country_id, search),
      service.countRegistrationTypes(country_id, search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/registration-types", async (req, reply) => {
    const data = RegistrationTypeInputSchema.parse(req.body);
    return reply.status(201).send(await service.createRegistrationType(data));
  });

  // Also serves the active toggle — the list sends { is_active } on its own.
  app.patch("/registration-types/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = RegistrationTypeInputSchema.partial().parse(req.body);
    return reply.send(await service.updateRegistrationType(id, data));
  });

  app.delete("/registration-types/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteRegistrationType(id);
    return reply.status(204).send();
  });
}
