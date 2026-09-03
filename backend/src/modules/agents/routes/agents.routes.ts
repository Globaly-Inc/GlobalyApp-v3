// Agent routes — public invitation accept + business-context-required CRUD & invitations.

import type { FastifyInstance } from "fastify";
import {
  AcceptInviteSchema,
  InviteAgentSchema,
  AgentParamsSchema,
  AgentPatchSchema,
  InvitationParamsSchema,
  MemberListQuerySchema,
} from "../schemas/agents.schema.js";
import { PaginationSchema, buildPaginatedResponse } from "../../../shared/pagination.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { ConflictError } from "../../../shared/errors.js";
import * as service from "../services/agents.service.js";
import * as repo from "../repositories/agents.repository.js";
import * as activityService from "../../businesses/services/activity.service.js";
import * as institutionMembers from "../../platform-users/services/institution-members.service.js";

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

// Institutions have no `agent_activity_log`-equivalent table, so activity logging is skipped
// for them below — the self-service Activity tab is business-only, same as Branches/Offices.
export async function agentBusinessRoutes(app: FastifyInstance) {
  // Super admins browse org-less (e.g. previewing the Personal portal, whose feed composer
  // asks this endpoint for @mention candidates) — treat that as "no team", not a 403, since
  // there's no org left to reject them from.
  app.get("/", async (req, reply) => {
    const { search, ...pagination } = MemberListQuerySchema.parse(req.query);
    if (!req.auth?.orgId) {
      if (req.auth?.type === "admin") return reply.send(buildPaginatedResponse([], 0, pagination));
      return reply.status(403).send({ error: "Switch to a business or institution context first" });
    }
    const result = req.auth.orgType === "institution"
      ? await institutionMembers.listMembers(req.db, pagination, search)
      : await service.listAgents(req.db, pagination, search);
    return reply.send(result);
  });

  app.get("/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const result = req.auth.orgType === "institution"
      ? await institutionMembers.getMember(req.db, id)
      : await service.getAgent(req.db, id);
    return reply.send(result);
  });

  app.get("/:id/offices", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const result = await service.getAgentOffices(req.db, id);
    return reply.send(result);
  });

  // Both tenant kinds have a `roles` table now (institutions since 20260826_001) — this is
  // the Combobox source for the invite/edit member drawer. Institution members store the
  // role NAME (members.role text); business agents store role_id.
  app.get("/roles", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const roles = await repo.listRoles(req.db);
    return reply.send(roles);
  });

  app.get("/invitations", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const result = req.auth.orgType === "institution"
      ? await institutionMembers.listInvitations(req.db, pagination)
      : await service.listInvitations(req.db, pagination);
    return reply.send(result);
  });

  app.delete("/invitations/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = InvitationParamsSchema.parse(req.params);
    if (req.auth.orgType === "institution") {
      await institutionMembers.cancelInvitation(req.db, id);
    } else {
      await service.cancelInvitation(req.db, id);
      await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITE_CANCELLED", "member", id);
    }
    return reply.status(204).send();
  });

  app.post("/invitations/:id/resend", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = InvitationParamsSchema.parse(req.params);
    if (req.auth.orgType === "institution") {
      await institutionMembers.resendInvitation(req.db, id, req.auth.orgId!);
    } else {
      await service.resendInvitation(req.db, id, req.auth.orgId!);
      await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITE_RESENT", "member", id);
    }
    return reply.status(204).send();
  });

  app.post("/invite", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const input = InviteAgentSchema.parse(req.body);
    if (req.auth.orgType === "institution") {
      const result = await institutionMembers.inviteMemberAsAdmin(req.db, req.institutionId, req.institution!.schema_name, input);
      return reply.status(201).send(result);
    }
    const result = await service.inviteAgent(req.db, input, Number(req.auth.sub), req.auth.orgId!);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_INVITED", "member", undefined, { email: input.email });
    return reply.status(201).send(result);
  });

  app.patch("/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    const patch = AgentPatchSchema.parse(req.body);
    if (req.auth.orgType === "institution") {
      // members.id is what :id names here (same as agents.id) — resolve to platform_user_id,
      // which is what updateMemberRole/setMemberStatus are keyed by for the admin route's sake.
      const member = await institutionMembers.getMember(req.db, id);
      if (patch.role !== undefined) await institutionMembers.updateMemberRole(req.db, req.institutionId, member.platform_user_id, patch.role);
      if (patch.account_status !== undefined) await institutionMembers.setMemberStatus(req.db, member.platform_user_id, patch.account_status);
      const result = await institutionMembers.getMember(req.db, id);
      return reply.send(result);
    }
    const result = await service.updateAgent(req.db, req.businessId, id, patch);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_UPDATED", "member", String(id));
    return reply.send(result);
  });

  app.delete("/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = AgentParamsSchema.parse(req.params);
    if (req.auth.orgType === "institution") {
      const member = await institutionMembers.getMember(req.db, id);
      const removed = await institutionMembers.removeMember(req.db, req.institutionId, member.platform_user_id);
      if (!removed) throw new ConflictError("Cannot remove the institution owner");
      return reply.status(204).send();
    }
    await service.removeAgent(req.db, req.businessId, id);
    await activityService.logActivity(req.db, Number(req.auth.sub), "MEMBER_REMOVED", "member", String(id));
    return reply.status(204).send();
  });
}

export async function agentRoutes(app: FastifyInstance) {
  await app.register(agentPublicRoutes);
  await app.register(agentBusinessRoutes);
}
