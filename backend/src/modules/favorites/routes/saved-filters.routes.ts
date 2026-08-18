// Prefix: /api/v3/filters — saved list-view filters and the caller's default.
//
// SCOPE COMES FROM THE TOKEN. req.business is set by tenant.plugin from the JWT's
// orgId claim; a token with no orgId leaves it undefined and the caller is in the
// personal (null) scope. Neither half is ever read from the request body or query.

import type { FastifyInstance, FastifyRequest } from "fastify";

import * as service from "../services/saved-filters.service.js";
import {
  DefaultFilterQuerySchema,
  FilterIdParamSchema,
  ListFiltersQuerySchema,
  SaveFilterSchema,
  SetDefaultFilterSchema,
} from "../schemas/saved-filters.schema.js";

function scopeOf(req: FastifyRequest): service.Scope {
  // Number(): core/types.ts declares BusinessRecord.id as string, but businesses.id
  // is `increments` and Postgres returns an integer. Coerced here rather than
  // widening a shared type another wave owns.
  return {
    userId: Number(req.auth.sub),
    businessId: req.business ? Number(req.business.id) : null,
  };
}

export async function savedFilterRoutes(app: FastifyInstance) {
  // Registered before "/:id/apply" and "/:id" so the static segment wins the route
  // match rather than being read as an id.
  app.get("/default", async (req, reply) => {
    const { module_key } = DefaultFilterQuerySchema.parse(req.query ?? {});
    return reply.send(await service.getDefault(scopeOf(req), module_key));
  });

  app.put("/default", async (req, reply) => {
    const { module_key, filter_id } = SetDefaultFilterSchema.parse(req.body ?? {});
    return reply.send(await service.setDefault(scopeOf(req), module_key, filter_id));
  });

  app.get("/", async (req, reply) => {
    const { module_key } = ListFiltersQuerySchema.parse(req.query ?? {});
    return reply.send(await service.list(scopeOf(req), module_key));
  });

  app.post("/", async (req, reply) => {
    const body = SaveFilterSchema.parse(req.body ?? {});
    return reply.status(201).send(await service.create(scopeOf(req), body));
  });

  app.post("/:id/apply", async (req, reply) => {
    const { id } = FilterIdParamSchema.parse(req.params);
    return reply.send(await service.apply(scopeOf(req), id));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = FilterIdParamSchema.parse(req.params);
    await service.remove(scopeOf(req), id);
    return reply.status(204).send();
  });
}
