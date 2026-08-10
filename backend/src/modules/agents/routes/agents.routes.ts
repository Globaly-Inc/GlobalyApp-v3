// Agent routes — public invitation accept + business-context-required CRUD & invitations.

import type { FastifyInstance } from "fastify";
import {
  AcceptInviteSchema,
  InviteAgentSchema,
  AgentParamsSchema,
} from "../schemas/agents.schema.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/agents.service.js";
import * as repo from "../repositories/agents.repository.js";

export async function agentRoutes(app: FastifyInstance) {
  // ── Public ──

  app.post("/invite/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const body = req.body as Record<string, string>;
    const { token } = AcceptInviteSchema.parse(body);
    const orgId = body.org_id;
    const result = await service.acceptInvitation(orgId, token);
    return reply.send(result);
  });

  // ── Business context required ──

  app.get("/", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const result = await service.listAgents(req.db, pagination);
    return reply.send(result);
  });

  app.get("/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const result = await service.getAgent(req.db, id);
    return reply.send(result);
  });

  app.get("/roles", { preHandler: requireBusinessContext }, async (req, reply) => {
    const roles = await repo.listRoles(req.db);
    return reply.send(roles);
  });

  app.post("/invite", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = InviteAgentSchema.parse(req.body);
    const result = await service.inviteAgent(
      req.db,
      input,
      Number(req.auth.sub),
      req.auth.orgId!,
    );
    return reply.status(201).send(result);
  });
}
