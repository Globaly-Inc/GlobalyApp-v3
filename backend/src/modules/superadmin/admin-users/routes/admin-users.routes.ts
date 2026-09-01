// Admin-users routes — public invitation accept + admin-only CRUD & invitations.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AcceptInviteSchema,
  InviteAdminSchema,
  UpdateAdminSchema,
  AdminParamsSchema,
} from "../schemas/admin-users.schema.js";
import { PaginationSchema } from "../../../../shared/pagination.js";
import { requireAdmin } from "../../../../core/plugins/auth.plugin.js";
import * as service from "../services/admin-users.service.js";

const ListQuery = PaginationSchema.extend({ search: z.string().optional() });
const PlatformUsersListQuery = ListQuery.extend({
  type: z.enum(["personal", "business", "institution"]).optional(),
  admin: z.coerce.boolean().optional(),
});

export async function adminUsersRoutes(app: FastifyInstance) {
  // ── Public ──

  app.post("/users/invite/accept", async (req, reply) => {
    const { token } = AcceptInviteSchema.parse(req.body);
    const result = await service.acceptInvitation(token);
    return reply.send(result);
  });

  // ── Admin-only ──

  app.get("/me", { preHandler: requireAdmin }, async (req, reply) => {
    const admin = await service.getAdminByPlatformUserId(Number(req.auth.sub));
    return reply.send(admin);
  });

  app.get("/users", { preHandler: requireAdmin }, async (req, reply) => {
    const { search, ...pagination } = ListQuery.parse(req.query);
    const result = await service.listAdmins(pagination, search);
    return reply.send(result);
  });

  app.get("/platform-users", { preHandler: requireAdmin }, async (req, reply) => {
    const { search, type, admin, ...pagination } = PlatformUsersListQuery.parse(req.query);
    const result = await service.listPlatformUsers(pagination, search, type, admin);
    return reply.send(result);
  });

  app.patch("/platform-users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const data = z.object({ account_status: z.number().int().min(0).max(1).optional(), is_email_verified: z.boolean().optional() }).parse(req.body);
    const result = await service.updatePlatformUser(id, data);
    return reply.send(result);
  });

  app.patch("/platform-users/:id/role", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const { role } = z.object({ role: z.enum(["super_admin", "data_admin"]).nullable() }).parse(req.body);
    const result = await service.setPlatformUserAdminRole(id, role, Number(req.auth.sub));
    return reply.send(result);
  });

  app.get("/users/invitations", { preHandler: requireAdmin }, async (req, reply) => {
    const { search, ...pagination } = ListQuery.parse(req.query);
    const result = await service.listInvitations(pagination, search);
    return reply.send(result);
  });

  app.post("/users/invitations/:id/resend", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await service.resendInvitation(id, req.auth.role!);
    return reply.send(result);
  });

  app.get("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = AdminParamsSchema.parse(req.params);
    const result = await service.getAdmin(id);
    return reply.send(result);
  });

  app.patch("/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = AdminParamsSchema.parse(req.params);
    const data = UpdateAdminSchema.parse(req.body);
    const result = await service.updateAdmin(id, data, req.auth.role!);
    return reply.send(result);
  });

  app.post("/users/invite", { preHandler: requireAdmin }, async (req, reply) => {
    const input = InviteAdminSchema.parse(req.body);
    const result = await service.inviteAdmin(
      input,
      Number(req.auth.sub),
      req.auth.role!,
    );
    return reply.status(201).send(result);
  });
}
