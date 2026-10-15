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
import { logEnquiryAudit } from "../../enquiries/shared/audit.js";
import { changedFields } from "../../../shared/changed-fields.js";

const SubIdSchema = z.object({ subId: z.string().uuid() });

/** Recorded in audit_logs so the superadmin Activity tab shows the owner's own branch changes. */
const logBranch = (req: { auth: { sub: string | number }; institutionId: number }, action: string, details: Record<string, unknown>) =>
  logEnquiryAudit(Number(req.auth.sub), action, { entityType: "institution", entityId: String(req.institutionId), details });

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
    await logBranch(req, "BRANCH_CREATED", { name: data.name });
    return reply.status(201).send(branch);
  });

  // An extracted campus (read-only in the list) the owner wants to edit — becomes a real branch now.
  app.post("/branches/campuses/:subId/convert", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const result = await service.convertCampusOnDemand("institutions", req.institutionId, subId);
    await logBranch(req, "BRANCH_CREATED", { from_campus: subId });
    return reply.status(201).send(result);
  });

  app.get("/branches/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    return reply.send(await service.getInstitutionBranch(req.institutionId, subId));
  });

  app.patch("/branches/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    const data = BranchPatchSchema.parse(req.body);
    const before = await service.getInstitutionBranch(req.institutionId, subId).catch(() => null);
    const branch = await service.updateInstitutionBranch(req.institutionId, subId, data);
    await logBranch(req, "BRANCH_UPDATED", { branch_id: subId, name: (branch as { name?: string } | null)?.name, fields: changedFields(before as Record<string, unknown> | null, data) });
    return reply.send(branch);
  });

  app.delete("/branches/:subId", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdSchema.parse(req.params);
    await service.deleteInstitutionBranch(req.institutionId, subId);
    await logBranch(req, "BRANCH_DELETED", { branch_id: subId });
    return reply.status(204).send();
  });
}
