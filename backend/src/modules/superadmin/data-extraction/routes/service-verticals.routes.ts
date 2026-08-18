// Service-vertical routes — the eight V3-only verticals §3.4 records as
// "Tables + jobs-repo whitelist exist; no dedicated routes or UI tabs".
//
// One route family parameterized by vertical, not eight copies: the eight tables
// share their whole review contract (status, promoted_service_id, name, provider,
// source_url, confidence_score) and differ only in the fields the registry in
// lib/service-verticals.ts records. The shape is the immigration family's —
// list / discard / promote, actor resolved at the boundary.

import type { FastifyInstance } from "fastify";

import * as service from "../services/service-verticals.service.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";
import { verticalSpec } from "../lib/service-verticals.js";
import {
  PromoteVerticalSchema,
  VerticalListQuerySchema,
  VerticalParamSchema,
  VerticalRowParamSchema,
} from "../schemas/service-verticals.schema.js";

export async function serviceVerticalsRoutes(app: FastifyInstance) {
  // The registry + per-status counts, which is what the admin tab bar renders.
  app.get("/service-verticals", async (_req, reply) => {
    return reply.send(await service.listVerticals());
  });

  // Staged rows for one vertical. The slug is enum-validated by the schema and then
  // resolved to a spec — the only path by which a table name enters SQL.
  app.get("/service-verticals/:vertical", async (req, reply) => {
    const { vertical } = VerticalParamSchema.parse(req.params);
    const query = VerticalListQuerySchema.parse(req.query);
    return reply.send(await service.listRows(verticalSpec(vertical)!, query));
  });

  app.post("/service-verticals/:vertical/:id/discard", async (req, reply) => {
    const { vertical, id } = VerticalRowParamSchema.parse(req.params);
    return reply.send(await service.discardRow(verticalSpec(vertical)!, id, await adminId(req)));
  });

  app.post("/service-verticals/:vertical/:id/promote", async (req, reply) => {
    const { vertical, id } = VerticalRowParamSchema.parse(req.params);
    const { target_org_type, target_org_id } = PromoteVerticalSchema.parse(req.body);
    return reply.send(
      await service.promoteRow(verticalSpec(vertical)!, id, target_org_type, target_org_id, await adminId(req)),
    );
  });
}
