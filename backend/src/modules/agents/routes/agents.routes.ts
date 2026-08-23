// Agent routes — public invitation accept + business-context-required CRUD & invitations.

import type { FastifyInstance } from "fastify";
import {
  AcceptInviteSchema,
  InviteAgentSchema,
  AgentParamsSchema,
  AgentPatchSchema,
  InvitationParamsSchema,
} from "../schemas/agents.schema.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/agents.service.js";
import * as repo from "../repositories/agents.repository.js";
import * as activityService from "../../businesses/services/activity.service.js";

export async function agentPublicRoutes(app: FastifyInstance) {
  app.post("/invite/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const body = req.body as Record<string, string>;
    const { token } = AcceptInviteSchema.parse(body);
    const orgId = body.org_id;
    const result = await service.acceptInvitation(orgId, token);
    return reply.send(result);
  });
}

export async function agentBusinessRoutes(app: FastifyInstance) {
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

  app.get("/:id/offices", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const result = await service.getAgentOffices(req.db, id);
    return reply.send(result);
  });

  app.get("/roles", { preHandler: requireBusinessContext }, async (req, reply) => {
    const roles = await repo.listRoles(req.db);
    return reply.send(roles);
  });

  app.get("/invitations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const result = await service.listInvitations(req.db, pagination);
    return reply.send(result);
  });

  app.delete("/invitations/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = InvitationParamsSchema.parse(req.params);
    await service.cancelInvitation(req.db, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITE_CANCELLED", "member", id);
    return reply.status(204).send();
  });

  app.post("/invitations/:id/resend", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = InvitationParamsSchema.parse(req.params);
    await service.resendInvitation(req.db, id, req.auth.orgId!);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITE_RESENT", "member", id);
    return reply.status(204).send();
  });

  app.post("/invite", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = InviteAgentSchema.parse(req.body);
    const result = await service.inviteAgent(
      req.db,
      input,
      Number(req.auth.sub),
      req.auth.orgId!,
    );
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITED", "member", undefined, { email: input.email });
    return reply.status(201).send(result);
  });

  app.patch("/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const patch = AgentPatchSchema.parse(req.body);
    const result = await service.updateAgent(req.db, id, patch);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_UPDATED", "member", String(id));
    return reply.send(result);
  });

  app.delete("/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    await service.removeAgent(req.db, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_REMOVED", "member", String(id));
    return reply.status(204).send();
  });
}

export async function agentRoutes(app: FastifyInstance) {
  await app.register(agentPublicRoutes);
  await app.register(agentBusinessRoutes);
}
