// Admin-users routes — OTP auth (public) + admin CRUD & invitations (auth-required).

import type { FastifyInstance } from "fastify";
import {
  AcceptInviteSchema,
  InviteAdminSchema,
  UpdateAdminSchema,
  AdminParamsSchema,
} from "../schemas/admin-users.schema.js";
import { PaginationSchema } from "../../../../shared/pagination.js";
import * as service from "../services/admin-users.service.js";

export async function adminUsersRoutes(app: FastifyInstance) {
  // ── Public ──

  app.get("/users/invite/accept", async (req, reply) => {
    const { token } = AcceptInviteSchema.parse(req.query);
    const result = await service.acceptInvitation(token);
    return reply.send(result);
  });

  // ── Auth-required ──

  app.get("/me", async (req, reply) => {
    const admin = await service.getAdmin(Number(req.auth.sub));
    return reply.send(admin);
  });

  app.get("/users", async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const result = await service.listAdmins(pagination);
    return reply.send(result);
  });

  app.get("/users/:id", async (req, reply) => {
    const { id } = AdminParamsSchema.parse(req.params);
    const result = await service.getAdmin(id);
    return reply.send(result);
  });

  app.patch("/users/:id", async (req, reply) => {
    const { id } = AdminParamsSchema.parse(req.params);
    const data = UpdateAdminSchema.parse(req.body);
    const result = await service.updateAdmin(id, data);
    return reply.send(result);
  });

  app.post("/users/invite", async (req, reply) => {
    const input = InviteAdminSchema.parse(req.body);
    const result = await service.inviteAdmin(
      input,
      Number(req.auth.sub),
      req.auth.role!,
    );
    return reply.status(201).send(result);
  });
}
