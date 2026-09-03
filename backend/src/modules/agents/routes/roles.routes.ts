// Custom role management (Settings → Roles) for BOTH tenant kinds — businesses and
// institutions have identical roles/permissions tables in their schemas. All endpoints
// owner-only: gated on agents.is_owner / members.is_owner directly, no roles:manage
// permission needed (so no seeder backfill for existing tenants either).
// Activity logging is business-only — institutions have no activity log table.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { RoleCreateSchema, RolePatchSchema, RoleParamsSchema } from "../schemas/agents.schema.js";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import type { TenantKind } from "../repositories/agents.repository.js";
import * as service from "../services/agents.service.js";
import * as activityService from "../../businesses/services/activity.service.js";

function kindOf(req: FastifyRequest): TenantKind {
  return req.auth.orgType === "institution" ? "institution" : "business";
}

// ponytail: only used here — move to auth.plugin if another route needs owner-only.
async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const table = kindOf(req) === "institution" ? "members" : "agents";
  const row = await req.db(table)
    .where({ platform_user_id: Number(req.auth.sub) })
    .whereNull("deleted_at")
    .first("is_owner");
  if (!row?.is_owner) {
    return reply.status(403).send({ error: "Only the owner can manage roles" });
  }
}

export async function businessRolesRoutes(app: FastifyInstance) {
  const guard = [requireBusinessOrInstitutionContext, requireOwner];

  app.get("/", { preHandler: guard }, async (req, reply) => {
    const roles = await service.listRolesWithDetails(req.db, kindOf(req));
    return reply.send(roles);
  });

  app.get("/permissions", { preHandler: guard }, async (req, reply) => {
    const permissions = await service.listPermissions(req.db);
    return reply.send(permissions);
  });

  app.post("/", { preHandler: guard }, async (req, reply) => {
    const input = RoleCreateSchema.parse(req.body);
    const role = await service.createRole(req.db, kindOf(req), input);
    if (kindOf(req) === "business") {
      await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_CREATED", "role", String(role.id), { name: role.name });
    }
    return reply.status(201).send(role);
  });

  app.patch("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    const patch = RolePatchSchema.parse(req.body);
    const role = await service.updateRole(req.db, kindOf(req), id, patch);
    if (kindOf(req) === "business") {
      await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_UPDATED", "role", String(id));
    }
    return reply.send(role);
  });

  app.delete("/:id", { preHandler: guard }, async (req, reply) => {
    const { id } = RoleParamsSchema.parse(req.params);
    await service.deleteRole(req.db, kindOf(req), id);
    if (kindOf(req) === "business") {
      await activityService.logActivity(req.db, Number(req.auth.sub), "ROLE_DELETED", "role", String(id));
    }
    return reply.status(204).send();
  });
}
