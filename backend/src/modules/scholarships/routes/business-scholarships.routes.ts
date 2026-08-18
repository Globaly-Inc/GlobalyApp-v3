// Business-facing scholarship submission. Registered under
// /api/v3/business/scholarships behind requireBusinessContext.
//
// This is the "submission" half of submission → pending → approved/rejected.
// V2's RLS had a "Business admins manage own scholarships" policy but no route
// implementing it, so there was no way for a provider to submit one; the admin
// CRUD API was the only entry point.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — and never from the path or body. Another business's listing is a
// 404, not a 403, which would confirm it exists.

import type { FastifyInstance } from "fastify";

import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import {
  IdParamSchema,
  ScholarshipListQuery,
  SubmitScholarshipSchema,
} from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import * as repo from "../../superadmin/monitoring/scholarships/repositories/scholarships.repository.js";
import * as moderation from "../../superadmin/monitoring/scholarships/services/moderation.service.js";

/**
 * BusinessRecord.id is declared string in core/types.ts but the column is a
 * serial — Number() is the narrowing, not a cast that could lie. Same precedent
 * as enquiries/routes/business-enquiries.routes.ts.
 */
function owner(req: { business?: { id: string | number } }): moderation.Owner {
  return { type: "business", id: Number(req.business!.id) };
}

export async function businessScholarshipRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/", async (req, reply) => {
    const { search, q, is_published, review_status, country, ...pagination } =
      ScholarshipListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    // Ownership is a filter, not a post-hoc check: a business cannot express a
    // query that reaches another org's rows in the first place.
    const filters = { search: search ?? q, is_published, review_status, country, owner: owner(req) };
    const [rows, total] = await Promise.all([
      repo.listAdmin(limit, offset, filters),
      repo.countAdmin(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/", async (req, reply) => {
    const data = SubmitScholarshipSchema.parse(req.body);
    return reply.status(201).send(await moderation.submit(data, Number(req.auth.sub), owner(req)));
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await moderation.assertOwned(id, owner(req));
    const data = SubmitScholarshipSchema.partial().parse(req.body);
    // Ownership and moderation columns are stripped: editing must not be a way to
    // re-parent a listing or self-approve it.
    const { owner_org_type: _t, owner_org_id: _i, is_platform_scholarship: _p, ...fields } = data;
    return reply.send(await repo.update(id, fields));
  });
}
