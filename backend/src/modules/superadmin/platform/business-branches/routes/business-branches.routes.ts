// Superadmin routes for a single business's branches.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import { BranchInputSchema, BranchListQuerySchema, BranchPatchSchema, IdParamSchema, LinkExistingBranchInputSchema, SubIdParamSchema } from "../schemas/business-branches.schema.js";
import * as service from "../services/business-branches.service.js";
import { changedFields } from "../../../../../shared/changed-fields.js";

export async function businessBranchesRoutes(app: FastifyInstance) {
  app.get("/businesses/:id/branches", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, filter_branch, ...pagination } = BranchListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listBranches(id, limit, offset, filter_branch, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/businesses/:id/branches", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = BranchInputSchema.parse(req.body);
    const branch = await service.createBranch(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_BRANCH_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(branch);
  });

  app.post("/businesses/:id/branches/link-existing", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = LinkExistingBranchInputSchema.parse(req.body);
    const result = await service.linkExistingBranch(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_BRANCH_LINKED", "business", undefined, {
      business_id: id, linked_business_id: data.business_id, branch_type: data.branch_type,
    });
    return reply.status(201).send(result);
  });

  // Single branch — the shared branch form's edit page loads it directly.
  app.get("/businesses/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getBranch(id, subId));
  });

  app.get("/institutions/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    return reply.send(await service.getInstitutionBranch(id, subId));
  });

  app.patch("/businesses/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = BranchPatchSchema.parse(req.body);
    const branch = await service.updateBranch(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_BRANCH_UPDATED", "business", undefined, { business_id: id, branch_id: subId });
    return reply.send(branch);
  });

  app.delete("/businesses/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteBranch(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_BRANCH_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  // Institution twins — the same service functions the institution's own portal uses. Creating one
  // mints a real branch institution owned by the parent's owner, so the parent must have an owner.
  app.post("/institutions/:id/branches", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = BranchInputSchema.parse(req.body);
    const branch = await service.createInstitutionBranch(id, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_BRANCH_CREATED", "institution", undefined, { institution_id: id, name: data.name });
    return reply.status(201).send(branch);
  });

  app.patch("/institutions/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = BranchPatchSchema.parse(req.body);
    const before = await service.getInstitutionBranch(id, subId).catch(() => null);
    const branch = await service.updateInstitutionBranch(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_BRANCH_UPDATED", "institution", undefined, {
      institution_id: id, branch_id: subId, name: (branch as { name?: string } | null)?.name, fields: changedFields(before as Record<string, unknown> | null, data),
    });
    return reply.send(branch);
  });

  app.delete("/institutions/:id/branches/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const gone = await service.getInstitutionBranch(id, subId).catch(() => null);
    await service.deleteInstitutionBranch(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_BRANCH_DELETED", "institution", undefined, {
      institution_id: id, branch_id: subId, name: (gone as { name?: string } | null)?.name,
    });
    return reply.status(204).send();
  });
}
