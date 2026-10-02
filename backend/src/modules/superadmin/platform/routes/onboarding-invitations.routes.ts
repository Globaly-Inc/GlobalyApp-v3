import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../shared/pagination.js";
import * as repo from "../platform.repository.js";
import * as service from "../../../platform-users/services/onboarding-invitations.service.js";
import {
  InvitationIdParamSchema, InvitationListQuerySchema, SendInvitationSchema,
} from "../../../platform-users/schemas/onboarding-invitations.schema.js";

export function adminOnboardingInvitationRoutes(app: FastifyInstance) {
  app.post("/onboarding-invitations", async (req, reply) => {
    const { email, name, business_category_id } = SendInvitationSchema.parse(req.body);
    const adminId = Number(req.auth.sub);
    const result = await service.sendInvitation(email, name, business_category_id, adminId);
    await repo.logAdminAction(adminId, "ONBOARDING_INVITE_SENT", "onboarding_invitation", undefined, { business_category_id, email, name });
    return reply.status(201).send(result);
  });

  app.get("/onboarding-invitations", async (req, reply) => {
    const { status, search, ...pagination } = InvitationListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { data, total, counts } = await service.listInvitations(limit, offset, status, search);
    return reply.send({ ...buildPaginatedResponse(data, total, pagination), counts });
  });

  app.post("/onboarding-invitations/:id/resend", async (req, reply) => {
    const { id } = InvitationIdParamSchema.parse(req.params);
    const ifRequested = (req.body as { if_requested?: unknown } | undefined)?.if_requested === true;
    const result = await service.resendInvitation(id, { ifRequested });
    await repo.logAdminAction(Number(req.auth.sub), "ONBOARDING_INVITE_RESENT", "onboarding_invitation", id);
    return reply.send(result);
  });

  app.delete("/onboarding-invitations/:id", async (req, reply) => {
    const { id } = InvitationIdParamSchema.parse(req.params);
    await service.revokeInvitation(id);
    await repo.logAdminAction(Number(req.auth.sub), "ONBOARDING_INVITE_REVOKED", "onboarding_invitation", id);
    return reply.status(204).send();
  });

  // Separate from DELETE /:id (revoke): this removes the row. Super admins only.
  app.delete("/onboarding-invitations/:id/permanent", async (req, reply) => {
    if (req.auth.role !== "super_admin") throw new ForbiddenError("Only super_admin can delete invites");
    const { id } = InvitationIdParamSchema.parse(req.params);
    await service.deleteInvitation(id);
    await repo.logAdminAction(Number(req.auth.sub), "ONBOARDING_INVITE_DELETED", "onboarding_invitation", id);
    return reply.status(204).send();
  });
}
