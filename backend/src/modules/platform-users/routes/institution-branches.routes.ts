// Self-service institution branches routes — institution context required.
// The institution twin of businesses' GET/POST/PATCH/DELETE /businesses/branches — same
// business_branches tenant table (see the institution migration's comment), no link-existing
// twin (see business-branches.service.ts's "Institution twins" section).

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { BranchInputSchema, BranchListQuerySchema, BranchPatchSchema } from "../../superadmin/platform/business-branches/schemas/business-branches.schema.js";
import * as service from "../../superadmin/platform/business-branches/services/business-branches.service.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });

export async function institutionBranchesRoutes(app: FastifyInstance) {
  app.get("/branches", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { search, filter_branch, ...pagination } = BranchListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionBranches(req.institutionId, limit, offset, filter_branch, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/branches", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const data = BranchInputSchema.parse(req.body);
    const branch = await service.createInstitutionBranch(req.institutionId, data);
    return reply.status(201).send(branch);
  });

  app.patch("/branches/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = BranchPatchSchema.parse(req.body);
    const branch = await service.updateInstitutionBranch(req.institutionId, subId, data);
    return reply.send(branch);
  });

  app.delete("/branches/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteInstitutionBranch(req.institutionId, subId);
    return reply.status(204).send();
  });
}
