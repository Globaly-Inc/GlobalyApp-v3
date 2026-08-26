// Custom role management (Settings → Roles). Business-only — institutions have no roles
// table. All endpoints owner-only: gated on agents.is_owner directly, no roles:manage
// permission needed (so no migration/seeder backfill for existing tenants either).

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { RoleCreateSchema, RolePatchSchema, RoleParamsSchema } from "../schemas/agents.schema.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/agents.service.js";
import * as activityService from "../../businesses/services/activity.service.js";

// ponytail: only used here — move to auth.plugin if another route needs owner-only.
async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const agent = await req.db("agents")
    .where({ platform_user_id: Number(req.auth.sub) })
    .whereNull("deleted_at")
    .first("is_owner");
  if (!agent?.is_owner) {
    return reply.status(403).send({ error: "Only the business owner can manage roles" });
  }
}

export async function businessRolesRoutes(app: FastifyInstance) {
  const guard = [requireBusinessContext, requireOwner];

  app.get("/", { preHandler: guard }, async (req, reply) => {
    const roles = await service.listRolesWithDetails(req.db);
    return reply.send(roles);
  });

  app.get("/permissions", { preHandler: guard }, async (req, reply) => {
    const permissions = await service.listPermissions(req.db);
    return reply.send(permissions);
  });

  app.post("/", { preHandler: guard }, async (req, reply) => {
    const input = RoleCreateSchema.parse(req.body);
    const role = await service.createRole(req.db, input);
    await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_CREATED", "role", String(role.id), { name: role.name });
    return reply.status(201).send(role);
  });

  app.patch("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    const patch = RolePatchSchema.parse(req.body);
    const role = await service.updateRole(req.db, id, patch);
    await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_UPDATED", "role", String(id));
    return reply.send(role);
  });

  app.delete("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    await service.deleteRole(req.db, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_DELETED", "role", String(id));
    return reply.status(204).send();
  });
}
