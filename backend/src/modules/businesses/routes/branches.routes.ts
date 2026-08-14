import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  BranchInputSchema, BranchListQuerySchema, BranchPatchSchema, LinkExistingBranchInputSchema,
} from "../../superadmin/platform/business-branches/schemas/business-branches.schema.js";
import * as service from "../../superadmin/platform/business-branches/services/business-branches.service.js";
import * as activityService from "../services/activity.service.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });

export async function businessBranchesRoutes(app: FastifyInstance) {
  app.get("/branches", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { search, filter_branch, ...pagination } = BranchListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listBranches(Number(req.business!.id), limit, offset, filter_branch, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/branches", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = BranchInputSchema.parse(req.body);
    const branch = await service.createBranch(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "BRANCH_CREATED", "branch", branch.id, { name: branch.name });
    return reply.status(201).send(branch);
  });

  app.post("/branches/link-existing", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = LinkExistingBranchInputSchema.parse(req.body);
    const result = await service.linkExistingBranch(Number(req.business!.id), data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "BRANCH_LINKED", "branch", result.branch.id, { linked_business_id: data.business_id });
    return reply.status(201).send(result);
  });

  app.patch("/branches/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = BranchPatchSchema.parse(req.body);
    const branch = await service.updateBranch(Number(req.business!.id), subId, data);
    await activityService.logActivity(req.db, Number(req.auth.sub), "BRANCH_UPDATED", "branch", subId);
    return reply.send(branch);
  });

  app.delete("/branches/:subId", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteBranch(Number(req.business!.id), subId);
    await activityService.logActivity(req.db, Number(req.auth.sub), "BRANCH_DELETED", "branch", subId);
    return reply.status(204).send();
  });
}
