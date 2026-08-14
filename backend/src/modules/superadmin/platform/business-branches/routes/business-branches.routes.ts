// Superadmin routes for a single business's branches.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import { BranchInputSchema, BranchListQuerySchema, BranchPatchSchema, IdParamSchema, LinkExistingBranchInputSchema, SubIdParamSchema } from "../schemas/business-branches.schema.js";
import * as service from "../services/business-branches.service.js";

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
}
