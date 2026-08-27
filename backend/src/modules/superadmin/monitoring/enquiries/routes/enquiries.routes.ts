// Superadmin oversight of the course-enquiry pipeline: what students asked, who it was
// distributed to, who paid to unlock, and where it ended up.
//
// Read-only. Reassigning or closing someone else's lead is a real power with its own audit
// and permission story; this answers "what happened to this enquiry". Role-gated by the
// parent monitoring module.
//
// ponytail: no service layer — nothing here does anything but read and shape rows.

import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import { EnquiryIdParam, EnquiryListQuery } from "../schemas/enquiries.schema.js";
import * as repo from "../repositories/enquiries.repository.js";

export async function adminEnquiryRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { search, status, ...pagination } = EnquiryListQuery.parse(req.query);
    const filters = { search, status };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([repo.list(filters, limit, offset), repo.count(filters)]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  /** Headline funnel for the screen's top strip, plus the per-status counts the filter chips use. */
  app.get("/stats", async (_req, reply) => {
    const [statuses, distributions] = await Promise.all([repo.statusCounts(), repo.distributionTotals()]);
    return reply.send({
      statuses,
      total: statuses.reduce((sum: number, s: { count: number }) => sum + Number(s.count), 0),
      distributions: distributions ?? { total: 0, unlocked: 0, coins_spent: 0 },
    });
  });

  app.get("/:id", async (req, reply) => {
    const { id } = EnquiryIdParam.parse(req.params);
    const enquiry = await repo.findById(id);
    if (!enquiry) throw new NotFoundError("Enquiry not found");
    const distributions = await repo.listDistributions(id);
    return reply.send({ ...enquiry, distributions });
  });
}
