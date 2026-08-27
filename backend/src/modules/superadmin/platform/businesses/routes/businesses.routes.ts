// Superadmin business management routes.

import type { FastifyInstance } from "fastify";
import { paginationToOffset, buildPaginatedResponse } from "../../../../../shared/pagination.js";
import { AppError, NotFoundError } from "../../../../../shared/errors.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import * as platformRepo from "../../platform.repository.js";
import * as service from "../services/businesses.service.js";
import {
  ActivityListQuerySchema, BulkClaimRequestSchema, BusinessCreateSchema, BusinessPatchSchema, EnquirySettingsPatchSchema,
  IdParamSchema, InstitutionInvitationParamsSchema, InstitutionMemberParamsSchema, InstitutionMemberStatusSchema,
  InstitutionPartnerInputSchema, InstitutionPartnerParamsSchema, InstitutionPartnerPatchSchema,
  InstitutionPatchSchema, InstitutionRoleParamsSchema, ListQuerySchema, MemberInviteSchema, MemberListQuerySchema,
  MemberParamsSchema, MemberPatchSchema, PublishedPatchSchema, RoleCreateSchema, RolePatchSchema, StatusPatchSchema,
} from "../schemas/businesses.schema.js";

export async function adminBusinessRoutes(app: FastifyInstance) {
  // POST /businesses/image — logo/cover upload. Returns the relative storage path, not a public
  app.post("/businesses/image", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");
    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length, new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]));
    const storagePath = storage.buildPath("businesses", file.filename);
    try {
      await storage.uploadFile(storagePath, buffer, file.mimetype);
    } catch {
      throw new AppError("Image upload failed — storage isn't configured correctly on this server.", 503, "STORAGE_UNAVAILABLE");
    }
    return reply.status(201).send({ path: storagePath });
  });

  // POST /businesses — admin creates an unclaimed business listing
  app.post("/businesses", async (req, reply) => {
    const { allowed_service_category_ids, ...data } = req.body as Record<string, unknown>;
    const input = BusinessCreateSchema.parse(data);
    const detail = await service.createBusiness(input);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CREATED", "business", undefined, { business_id: detail!.id });
    return reply.status(201).send(detail);
  });

  // GET /businesses — supports filtering by numeric category id (main list's category
  // dropdown), by category_slug (e.g. partner-pairing lookups that only know a slug), or by
  // `kind` (a consultancy/partner picker that wants one table, no category restriction).
  app.get("/businesses", async (req, reply) => {
    const { search, status, category, category_slug, kind, ...pagination } = ListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listBusinesses(limit, offset, search, status, category, category_slug, kind);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/listings/:id/kind", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.resolveListingKind(id));
  });

  // GET /businesses/:id
  app.get("/businesses/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.getBusinessDetail(id));
  });

  // PATCH /businesses/:id
  app.patch("/businesses/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = BusinessPatchSchema.parse(req.body);
    const updated = await service.updateBusiness(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_UPDATED", "business", undefined, { business_id: id, ...data });
    return reply.send(updated);
  });

  // PATCH /businesses/:id/status
  app.patch("/businesses/:id/status", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { status } = StatusPatchSchema.parse(req.body);
    const result = await service.updateStatus(id, status);
    await platformRepo.logAdminAction(Number(req.auth.sub), `BUSINESS_STATUS_${status.toUpperCase()}`, "business", undefined, { business_id: id });
    return reply.send(result);
  });

  // POST /businesses/claim-requests/bulk — queues claim-request emails for many businesses at once
  app.post("/businesses/claim-requests/bulk", async (req, reply) => {
    const { ids } = BulkClaimRequestSchema.parse(req.body);
    const result = await service.queueBulkClaimRequests(ids);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CLAIM_REQUEST_BULK_QUEUED", "business", undefined, { business_ids: ids });
    return reply.status(202).send(result);
  });

  // POST /businesses/:id/claim-request — emails a link to claim this pre-seeded business
  app.post("/businesses/:id/claim-request", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const result = await service.sendClaimRequest(id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CLAIM_REQUEST_SENT", "business", undefined, { business_id: id });
    return reply.send(result);
  });

  // POST /institutions/:id/claim-request — the institution twin. Separate path because the id
  // spaces are separate: institution 3 and business 3 are different rows.
  app.post("/institutions/:id/claim-request", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const result = await service.sendInstitutionClaimRequest(id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_CLAIM_REQUEST_SENT", "institution", undefined, { institution_id: id });
    return reply.send(result);
  });

  // Institution twins of status/published/delete — the admin list mixes both tables, so each
  // row action routes by kind. Separate paths because the id spaces are separate.
  app.patch("/institutions/:id/status", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { status } = StatusPatchSchema.parse(req.body);
    const result = await service.updateInstitutionStatus(id, status);
    await platformRepo.logAdminAction(Number(req.auth.sub), `INSTITUTION_STATUS_${status.toUpperCase()}`, "institution", undefined, { institution_id: id });
    return reply.send(result);
  });

  app.patch("/institutions/:id/published", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { is_published } = PublishedPatchSchema.parse(req.body);
    const result = await service.updateInstitutionPublished(id, is_published);
    await platformRepo.logAdminAction(Number(req.auth.sub), is_published ? "INSTITUTION_PUBLISHED" : "INSTITUTION_UNPUBLISHED", "institution", undefined, { institution_id: id });
    return reply.send(result);
  });

  app.delete("/institutions/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteInstitution(id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  // GET /institutions/:id — the institution twin of GET /businesses/:id.
  app.get("/institutions/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.getInstitutionDetail(id));
  });

  // PATCH /institutions/:id — the institution twin of PATCH /businesses/:id.
  app.patch("/institutions/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = InstitutionPatchSchema.parse(req.body);
    const updated = await service.updateInstitutionDetail(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_UPDATED", "institution", undefined, { institution_id: id, ...data });
    return reply.send(updated);
  });

  // GET /institutions/:id/members — institutions' tenant `members` table, no roles table to join.
  app.get("/institutions/:id/members", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = MemberListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionMembers(id, { search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /institutions/:id/courses — extraction_courses filed under the institution's source_job_id.
  app.get("/institutions/:id/courses", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = MemberListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionCourses(id, { search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /institutions/:id/branches — extraction_campuses filed under the institution's source_job_id.
  app.get("/institutions/:id/branches", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = MemberListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionBranches(id, { search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /institutions/:id/partners — manually-linked consultancies (business_representations)
  // merged with extraction_agents filed under the institution's source_job_id, tagged by `source`.
  app.get("/institutions/:id/partners", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = MemberListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionPartners(id, { search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // POST /institutions/:id/partners — "Link consultancy": institution picks a business to link.
  app.post("/institutions/:id/partners", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = InstitutionPartnerInputSchema.parse(req.body);
    const partner = await service.createInstitutionPartner(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_PARTNER_ADDED", "institution", undefined, {
      institution_id: id, business_id: data.business_id,
    });
    return reply.status(201).send(partner);
  });

  app.patch("/institutions/:id/partners/:partnerId", async (req, reply) => {
    const { id, partnerId } = InstitutionPartnerParamsSchema.parse(req.params);
    const data = InstitutionPartnerPatchSchema.parse(req.body);
    const partner = await service.updateInstitutionPartner(id, partnerId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_PARTNER_UPDATED", "institution", undefined, { institution_id: id, partner_id: partnerId });
    return reply.send(partner);
  });

  app.delete("/institutions/:id/partners/:partnerId", async (req, reply) => {
    const { id, partnerId } = InstitutionPartnerParamsSchema.parse(req.params);
    await service.deleteInstitutionPartner(id, partnerId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_PARTNER_REMOVED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });

  // POST /institutions/:id/invite — admin invites a member; they land in the tenant `members`
  // table once they accept (institutions' twin of POST /businesses/:id/members).
  app.post("/institutions/:id/invite", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = MemberInviteSchema.parse(req.body);
    const invitation = await service.inviteInstitutionMember(id, input);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_MEMBER_INVITED", "institution", undefined, { institution_id: id, email: input.email });
    return reply.status(201).send(invitation);
  });

  // GET /institutions/:id/invitations — pending invites, separate from the accepted-members list.
  app.get("/institutions/:id/invitations", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const pagination = ActivityListQuerySchema.parse(req.query);
    return reply.send(await service.listInstitutionInvitations(id, pagination));
  });

  // DELETE /institutions/:id/invitations/:invitationId — cancel a pending invite.
  app.delete("/institutions/:id/invitations/:invitationId", async (req, reply) => {
    const { id, invitationId } = InstitutionInvitationParamsSchema.parse(req.params);
    await service.cancelInstitutionInvitation(id, invitationId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_INVITE_CANCELLED", "institution", undefined, { institution_id: id, invitation_id: invitationId });
    return reply.status(204).send();
  });

  // POST /institutions/:id/invitations/:invitationId/resend — rotate the token, re-send the email.
  app.post("/institutions/:id/invitations/:invitationId/resend", async (req, reply) => {
    const { id, invitationId } = InstitutionInvitationParamsSchema.parse(req.params);
    await service.resendInstitutionInvitation(id, invitationId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_INVITE_RESENT", "institution", undefined, { institution_id: id, invitation_id: invitationId });
    return reply.status(204).send();
  });

  // PATCH /institutions/:id/members/:platformUserId/status — suspend/reinstate a member.
  app.patch("/institutions/:id/members/:platformUserId/status", async (req, reply) => {
    const { id, platformUserId } = InstitutionMemberParamsSchema.parse(req.params);
    const { account_status } = InstitutionMemberStatusSchema.parse(req.body);
    await service.setInstitutionMemberStatus(id, platformUserId, account_status);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_MEMBER_STATUS_UPDATED", "institution", undefined, { institution_id: id, platform_user_id: platformUserId, account_status });
    return reply.status(204).send();
  });

  // ── Institution roles management ──

  app.get("/institutions/:id/roles", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionRoles(id));
  });

  app.get("/institutions/:id/roles/permissions", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listInstitutionPermissions(id));
  });

  app.post("/institutions/:id/roles", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = RoleCreateSchema.parse(req.body);
    const role = await service.createInstitutionRole(id, input);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_ROLE_CREATED", "institution", undefined, { institution_id: id, name: role.name });
    return reply.status(201).send(role);
  });

  app.patch("/institutions/:id/roles/:roleId", async (req, reply) => {
    const { id, roleId } = InstitutionRoleParamsSchema.parse(req.params);
    const patch = RolePatchSchema.parse(req.body);
    const role = await service.updateInstitutionRole(id, roleId, patch);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_ROLE_UPDATED", "institution", undefined, { institution_id: id, role_id: roleId });
    return reply.send(role);
  });

  app.delete("/institutions/:id/roles/:roleId", async (req, reply) => {
    const { id, roleId } = InstitutionRoleParamsSchema.parse(req.params);
    await service.deleteInstitutionRole(id, roleId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_ROLE_DELETED", "institution", undefined, { institution_id: id, role_id: roleId });
    return reply.status(204).send();
  });

  // PATCH /businesses/:id/published
  app.patch("/businesses/:id/published", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { is_published } = PublishedPatchSchema.parse(req.body);
    const result = await service.updatePublished(id, is_published);
    await platformRepo.logAdminAction(Number(req.auth.sub), is_published ? "BUSINESS_PUBLISHED" : "BUSINESS_UNPUBLISHED", "business", undefined, { business_id: id });
    return reply.send(result);
  });

  // DELETE /businesses/:id
  app.delete("/businesses/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteBusiness(id);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  // PATCH /businesses/:id/enquiry-settings
  app.patch("/businesses/:id/enquiry-settings", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = EnquirySettingsPatchSchema.parse(req.body);
    const updated = await service.updateEnquirySettings(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_ENQUIRY_SETTINGS_UPDATED", "business", undefined, { business_id: id, ...data });
    return reply.send(updated);
  });

  // GET /businesses/:id/members — ?point_of_contact=true filters to the Contacts tab; ?search= matches name/email
  app.get("/businesses/:id/members", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { point_of_contact, search, ...pagination } = MemberListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listMembers(id, { pointOfContact: point_of_contact, search, limit, offset });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /businesses/:id/roles
  app.get("/businesses/:id/roles", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.listMemberRoles(id));
  });

  // POST /businesses/:id/members — invite a member/contact; they land in `agents` once accepted
  app.post("/businesses/:id/members", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = MemberInviteSchema.parse(req.body);
    const invitation = await service.inviteMember(id, data, Number(req.auth.sub));
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_MEMBER_INVITED", "business", undefined, { business_id: id, email: data.email });
    return reply.status(201).send(invitation);
  });

  // PATCH /businesses/:id/members/:memberId
  app.patch("/businesses/:id/members/:memberId", async (req, reply) => {
    const { id, memberId } = MemberParamsSchema.parse(req.params);
    const data = MemberPatchSchema.parse(req.body);
    const updated = await service.updateMember(id, memberId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_MEMBER_UPDATED", "business", undefined, { business_id: id, member_id: memberId });
    return reply.send(updated);
  });

  // DELETE /businesses/:id/members/:memberId
  app.delete("/businesses/:id/members/:memberId", async (req, reply) => {
    const { id, memberId } = MemberParamsSchema.parse(req.params);
    await service.removeMember(id, memberId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_MEMBER_REMOVED", "business", undefined, { business_id: id, member_id: memberId });
    return reply.status(204).send();
  });

  // GET /businesses/:id/activity
  app.get("/businesses/:id/activity", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const pagination = ActivityListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listActivity(id, limit, offset);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
