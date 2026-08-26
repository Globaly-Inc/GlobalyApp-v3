// Self-service institution role management — institution owner only.
// Mounted at /api/v3/institutions/roles by platform-users/index.ts.

import type { FastifyInstance } from "fastify";
import { requireInstitutionContext, requireInstitutionRole } from "../../../core/plugins/auth.plugin.js";
import { RoleCreateSchema, RolePatchSchema, RoleParamsSchema } from "../../agents/schemas/agents.schema.js";
import * as service from "../services/institution-members.service.js";

export async function institutionRolesRoutes(app: FastifyInstance) {
  const guard = [requireInstitutionContext, requireInstitutionRole("owner")];

  app.get("/", { preHandler: guard }, async (req, reply) => {
    const roles = await service.listRolesWithDetails(req.db!);
    return reply.send(roles);
  });

  app.get("/permissions", { preHandler: guard }, async (req, reply) => {
    const permissions = await service.listPermissions(req.db!);
    return reply.send(permissions);
  });

  app.post("/", { preHandler: guard }, async (req, reply) => {
    const input = RoleCreateSchema.parse(req.body);
    const role = await service.createRole(req.db!, input);
    return reply.status(201).send(role);
  });

  app.patch("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    const patch = RolePatchSchema.parse(req.body);
    const role = await service.updateRole(req.db!, id, patch);
    return reply.send(role);
  });

  app.delete("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    await service.deleteRole(req.db!, id);
    return reply.status(204).send();
  });
}
