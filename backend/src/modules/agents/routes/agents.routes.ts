// Agent routes — OTP auth (public) + CRUD & invitations (auth-required).

import type { FastifyInstance } from "fastify";
import {
  AcceptInviteSchema,
  InviteAgentSchema,
  AgentParamsSchema,
} from "../schemas/agents.schema.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import * as service from "../services/agents.service.js";
import * as repo from "../repositories/agents.repository.js";

export async function agentRoutes(app: FastifyInstance) {
  // ── Public ──

  app.get("/invite/accept", async (req, reply) => {
    const { token } = AcceptInviteSchema.parse(req.query);
    const subdomain = (req.query as Record<string, string>).subdomain;
    const result = await service.acceptInvitation(subdomain, token);
    return reply.send(result);
  });

  // ── Auth-required ──

  app.get("/", async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const result = await service.listAgents(req.db, pagination);
    return reply.send(result);
  });

  app.get("/:id", async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const result = await service.getAgent(req.db, id);
    return reply.send(result);
  });

  app.get("/roles", async (req, reply) => {
    const roles = await repo.listRoles(req.db);
    return reply.send(roles);
  });

  app.post("/invite", async (req, reply) => {
    const input = InviteAgentSchema.parse(req.body);
    const result = await service.inviteAgent(
      req.db,
      input,
      Number(req.auth.sub),
      req.auth.orgId!,  // business ID from JWT — service looks up subdomain
    );
    return reply.status(201).send(result);
  });
}
