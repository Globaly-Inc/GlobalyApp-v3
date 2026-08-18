// Superadmin business management routes.

import type { FastifyInstance } from "fastify";
import { paginationToOffset, buildPaginatedResponse } from "../../../../../shared/pagination.js";
import { AppError, NotFoundError } from "../../../../../shared/errors.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import * as platformRepo from "../../platform.repository.js";
import * as service from "../services/businesses.service.js";
import {
  ActivityListQuerySchema, BusinessCreateSchema, BusinessPatchSchema, EnquirySettingsPatchSchema,
  IdParamSchema, ListQuerySchema, MemberInviteSchema, MemberListQuerySchema, MemberParamsSchema, MemberPatchSchema,
  PublishedPatchSchema, StatusPatchSchema,
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
    // Stripped before parse: BusinessCreateSchema does not accept it. The admin UI
    // still sends it, so it is discarded here rather than rejected — see business_allowed_categories.
    const { allowed_service_category_ids: _allowed_service_category_ids, ...data } =
      req.body as Record<string, unknown>;
    const input = BusinessCreateSchema.parse(data);
    const detail = await service.createBusiness(input);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CREATED", "business", undefined, { business_id: detail!.id });
    return reply.status(201).send(detail);
  });

  // GET /businesses — supports filtering by numeric category id (main list's category
  // dropdown) or by category_slug (e.g. partner-pairing lookups that only know a slug).
  app.get("/businesses", async (req, reply) => {
    const { search, status, category, category_slug, ...pagination } = ListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listBusinesses(limit, offset, search, status, category, category_slug);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
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
